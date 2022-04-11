(function (global, factory) {
    typeof exports === 'object' && typeof module !== 'undefined' ? module.exports = factory(require('framework7')) :
    typeof define === 'function' && define.amd ? define(['framework7'], factory) :
    (global = global || self, global.messages = factory(global.Framework7));
}(this, (function (Framework7) { 'use strict';

    Framework7 = Framework7 && Framework7.hasOwnProperty('default') ? Framework7['default'] : Framework7;

    function noop() { }
    function assign(tar, src) {
        // @ts-ignore
        for (const k in src)
            tar[k] = src[k];
        return tar;
    }
    function run(fn) {
        return fn();
    }
    function blank_object() {
        return Object.create(null);
    }
    function run_all(fns) {
        fns.forEach(run);
    }
    function is_function(thing) {
        return typeof thing === 'function';
    }
    function safe_not_equal(a, b) {
        return a != a ? b == b : a !== b || ((a && typeof a === 'object') || typeof a === 'function');
    }
    function create_slot(definition, ctx, $$scope, fn) {
        if (definition) {
            const slot_ctx = get_slot_context(definition, ctx, $$scope, fn);
            return definition[0](slot_ctx);
        }
    }
    function get_slot_context(definition, ctx, $$scope, fn) {
        return definition[1] && fn
            ? assign($$scope.ctx.slice(), definition[1](fn(ctx)))
            : $$scope.ctx;
    }
    function get_slot_changes(definition, $$scope, dirty, fn) {
        if (definition[2] && fn) {
            const lets = definition[2](fn(dirty));
            if ($$scope.dirty === undefined) {
                return lets;
            }
            if (typeof lets === 'object') {
                const merged = [];
                const len = Math.max($$scope.dirty.length, lets.length);
                for (let i = 0; i < len; i += 1) {
                    merged[i] = $$scope.dirty[i] | lets[i];
                }
                return merged;
            }
            return $$scope.dirty | lets;
        }
        return $$scope.dirty;
    }
    function exclude_internal_props(props) {
        const result = {};
        for (const k in props)
            if (k[0] !== '$')
                result[k] = props[k];
        return result;
    }
    function compute_rest_props(props, keys) {
        const rest = {};
        keys = new Set(keys);
        for (const k in props)
            if (!keys.has(k) && k[0] !== '$')
                rest[k] = props[k];
        return rest;
    }

    function append(target, node) {
        target.appendChild(node);
    }
    function insert(target, node, anchor) {
        target.insertBefore(node, anchor || null);
    }
    function detach(node) {
        node.parentNode.removeChild(node);
    }
    function element(name) {
        return document.createElement(name);
    }
    function text(data) {
        return document.createTextNode(data);
    }
    function space() {
        return text(' ');
    }
    function empty() {
        return text('');
    }
    function listen(node, event, handler, options) {
        node.addEventListener(event, handler, options);
        return () => node.removeEventListener(event, handler, options);
    }
    function attr(node, attribute, value) {
        if (value == null)
            node.removeAttribute(attribute);
        else if (node.getAttribute(attribute) !== value)
            node.setAttribute(attribute, value);
    }
    function set_attributes(node, attributes) {
        // @ts-ignore
        const descriptors = Object.getOwnPropertyDescriptors(node.__proto__);
        for (const key in attributes) {
            if (attributes[key] == null) {
                node.removeAttribute(key);
            }
            else if (key === 'style') {
                node.style.cssText = attributes[key];
            }
            else if (key === '__value') {
                node.value = node[key] = attributes[key];
            }
            else if (descriptors[key] && descriptors[key].set) {
                node[key] = attributes[key];
            }
            else {
                attr(node, key, attributes[key]);
            }
        }
    }
    function children(element) {
        return Array.from(element.childNodes);
    }
    function set_data(text, data) {
        data = '' + data;
        if (text.data !== data)
            text.data = data;
    }
    function toggle_class(element, name, toggle) {
        element.classList[toggle ? 'add' : 'remove'](name);
    }
    function custom_event(type, detail) {
        const e = document.createEvent('CustomEvent');
        e.initCustomEvent(type, false, false, detail);
        return e;
    }
    class HtmlTag {
        constructor(html, anchor = null) {
            this.e = element('div');
            this.a = anchor;
            this.u(html);
        }
        m(target, anchor = null) {
            for (let i = 0; i < this.n.length; i += 1) {
                insert(target, this.n[i], anchor);
            }
            this.t = target;
        }
        u(html) {
            this.e.innerHTML = html;
            this.n = Array.from(this.e.childNodes);
        }
        p(html) {
            this.d();
            this.u(html);
            this.m(this.t, this.a);
        }
        d() {
            this.n.forEach(detach);
        }
    }

    let current_component;
    function set_current_component(component) {
        current_component = component;
    }
    function get_current_component() {
        if (!current_component)
            throw new Error(`Function called outside component initialization`);
        return current_component;
    }
    function beforeUpdate(fn) {
        get_current_component().$$.before_update.push(fn);
    }
    function onMount(fn) {
        get_current_component().$$.on_mount.push(fn);
    }
    function afterUpdate(fn) {
        get_current_component().$$.after_update.push(fn);
    }
    function onDestroy(fn) {
        get_current_component().$$.on_destroy.push(fn);
    }
    function createEventDispatcher() {
        const component = get_current_component();
        return (type, detail) => {
            const callbacks = component.$$.callbacks[type];
            if (callbacks) {
                // TODO are there situations where events could be dispatched
                // in a server (non-DOM) environment?
                const event = custom_event(type, detail);
                callbacks.slice().forEach(fn => {
                    fn.call(component, event);
                });
            }
        };
    }

    const dirty_components = [];
    const binding_callbacks = [];
    const render_callbacks = [];
    const flush_callbacks = [];
    const resolved_promise = Promise.resolve();
    let update_scheduled = false;
    function schedule_update() {
        if (!update_scheduled) {
            update_scheduled = true;
            resolved_promise.then(flush);
        }
    }
    function tick() {
        schedule_update();
        return resolved_promise;
    }
    function add_render_callback(fn) {
        render_callbacks.push(fn);
    }
    let flushing = false;
    const seen_callbacks = new Set();
    function flush() {
        if (flushing)
            return;
        flushing = true;
        do {
            // first, call beforeUpdate functions
            // and update components
            for (let i = 0; i < dirty_components.length; i += 1) {
                const component = dirty_components[i];
                set_current_component(component);
                update(component.$$);
            }
            dirty_components.length = 0;
            while (binding_callbacks.length)
                binding_callbacks.pop()();
            // then, once components are updated, call
            // afterUpdate functions. This may cause
            // subsequent updates...
            for (let i = 0; i < render_callbacks.length; i += 1) {
                const callback = render_callbacks[i];
                if (!seen_callbacks.has(callback)) {
                    // ...so guard against infinite loops
                    seen_callbacks.add(callback);
                    callback();
                }
            }
            render_callbacks.length = 0;
        } while (dirty_components.length);
        while (flush_callbacks.length) {
            flush_callbacks.pop()();
        }
        update_scheduled = false;
        flushing = false;
        seen_callbacks.clear();
    }
    function update($$) {
        if ($$.fragment !== null) {
            $$.update();
            run_all($$.before_update);
            const dirty = $$.dirty;
            $$.dirty = [-1];
            $$.fragment && $$.fragment.p($$.ctx, dirty);
            $$.after_update.forEach(add_render_callback);
        }
    }
    const outroing = new Set();
    let outros;
    function group_outros() {
        outros = {
            r: 0,
            c: [],
            p: outros // parent group
        };
    }
    function check_outros() {
        if (!outros.r) {
            run_all(outros.c);
        }
        outros = outros.p;
    }
    function transition_in(block, local) {
        if (block && block.i) {
            outroing.delete(block);
            block.i(local);
        }
    }
    function transition_out(block, local, detach, callback) {
        if (block && block.o) {
            if (outroing.has(block))
                return;
            outroing.add(block);
            outros.c.push(() => {
                outroing.delete(block);
                if (callback) {
                    if (detach)
                        block.d(1);
                    callback();
                }
            });
            block.o(local);
        }
    }
    function outro_and_destroy_block(block, lookup) {
        transition_out(block, 1, 1, () => {
            lookup.delete(block.key);
        });
    }
    function update_keyed_each(old_blocks, dirty, get_key, dynamic, ctx, list, lookup, node, destroy, create_each_block, next, get_context) {
        let o = old_blocks.length;
        let n = list.length;
        let i = o;
        const old_indexes = {};
        while (i--)
            old_indexes[old_blocks[i].key] = i;
        const new_blocks = [];
        const new_lookup = new Map();
        const deltas = new Map();
        i = n;
        while (i--) {
            const child_ctx = get_context(ctx, list, i);
            const key = get_key(child_ctx);
            let block = lookup.get(key);
            if (!block) {
                block = create_each_block(key, child_ctx);
                block.c();
            }
            else if (dynamic) {
                block.p(child_ctx, dirty);
            }
            new_lookup.set(key, new_blocks[i] = block);
            if (key in old_indexes)
                deltas.set(key, Math.abs(i - old_indexes[key]));
        }
        const will_move = new Set();
        const did_move = new Set();
        function insert(block) {
            transition_in(block, 1);
            block.m(node, next, lookup.has(block.key));
            lookup.set(block.key, block);
            next = block.first;
            n--;
        }
        while (o && n) {
            const new_block = new_blocks[n - 1];
            const old_block = old_blocks[o - 1];
            const new_key = new_block.key;
            const old_key = old_block.key;
            if (new_block === old_block) {
                // do nothing
                next = new_block.first;
                o--;
                n--;
            }
            else if (!new_lookup.has(old_key)) {
                // remove old block
                destroy(old_block, lookup);
                o--;
            }
            else if (!lookup.has(new_key) || will_move.has(new_key)) {
                insert(new_block);
            }
            else if (did_move.has(old_key)) {
                o--;
            }
            else if (deltas.get(new_key) > deltas.get(old_key)) {
                did_move.add(new_key);
                insert(new_block);
            }
            else {
                will_move.add(old_key);
                o--;
            }
        }
        while (o--) {
            const old_block = old_blocks[o];
            if (!new_lookup.has(old_block.key))
                destroy(old_block, lookup);
        }
        while (n)
            insert(new_blocks[n - 1]);
        return new_blocks;
    }

    function get_spread_update(levels, updates) {
        const update = {};
        const to_null_out = {};
        const accounted_for = { $$scope: 1 };
        let i = levels.length;
        while (i--) {
            const o = levels[i];
            const n = updates[i];
            if (n) {
                for (const key in o) {
                    if (!(key in n))
                        to_null_out[key] = 1;
                }
                for (const key in n) {
                    if (!accounted_for[key]) {
                        update[key] = n[key];
                        accounted_for[key] = 1;
                    }
                }
                levels[i] = n;
            }
            else {
                for (const key in o) {
                    accounted_for[key] = 1;
                }
            }
        }
        for (const key in to_null_out) {
            if (!(key in update))
                update[key] = undefined;
        }
        return update;
    }
    function get_spread_object(spread_props) {
        return typeof spread_props === 'object' && spread_props !== null ? spread_props : {};
    }
    function create_component(block) {
        block && block.c();
    }
    function mount_component(component, target, anchor) {
        const { fragment, on_mount, on_destroy, after_update } = component.$$;
        fragment && fragment.m(target, anchor);
        // onMount happens before the initial afterUpdate
        add_render_callback(() => {
            const new_on_destroy = on_mount.map(run).filter(is_function);
            if (on_destroy) {
                on_destroy.push(...new_on_destroy);
            }
            else {
                // Edge case - component was destroyed immediately,
                // most likely as a result of a binding initialising
                run_all(new_on_destroy);
            }
            component.$$.on_mount = [];
        });
        after_update.forEach(add_render_callback);
    }
    function destroy_component(component, detaching) {
        const $$ = component.$$;
        if ($$.fragment !== null) {
            run_all($$.on_destroy);
            $$.fragment && $$.fragment.d(detaching);
            // TODO null out other refs, including component.$$ (but need to
            // preserve final state?)
            $$.on_destroy = $$.fragment = null;
            $$.ctx = [];
        }
    }
    function make_dirty(component, i) {
        if (component.$$.dirty[0] === -1) {
            dirty_components.push(component);
            schedule_update();
            component.$$.dirty.fill(0);
        }
        component.$$.dirty[(i / 31) | 0] |= (1 << (i % 31));
    }
    function init(component, options, instance, create_fragment, not_equal, props, dirty = [-1]) {
        const parent_component = current_component;
        set_current_component(component);
        const prop_values = options.props || {};
        const $$ = component.$$ = {
            fragment: null,
            ctx: null,
            // state
            props,
            update: noop,
            not_equal,
            bound: blank_object(),
            // lifecycle
            on_mount: [],
            on_destroy: [],
            before_update: [],
            after_update: [],
            context: new Map(parent_component ? parent_component.$$.context : []),
            // everything else
            callbacks: blank_object(),
            dirty
        };
        let ready = false;
        $$.ctx = instance
            ? instance(component, prop_values, (i, ret, ...rest) => {
                const value = rest.length ? rest[0] : ret;
                if ($$.ctx && not_equal($$.ctx[i], $$.ctx[i] = value)) {
                    if ($$.bound[i])
                        $$.bound[i](value);
                    if (ready)
                        make_dirty(component, i);
                }
                return ret;
            })
            : [];
        $$.update();
        ready = true;
        run_all($$.before_update);
        // `false` as a special case of no DOM component
        $$.fragment = create_fragment ? create_fragment($$.ctx) : false;
        if (options.target) {
            if (options.hydrate) {
                const nodes = children(options.target);
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                $$.fragment && $$.fragment.l(nodes);
                nodes.forEach(detach);
            }
            else {
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                $$.fragment && $$.fragment.c();
            }
            if (options.intro)
                transition_in(component.$$.fragment);
            mount_component(component, options.target, options.anchor);
            flush();
        }
        set_current_component(parent_component);
    }
    class SvelteComponent {
        $destroy() {
            destroy_component(this, 1);
            this.$destroy = noop;
        }
        $on(type, callback) {
            const callbacks = (this.$$.callbacks[type] || (this.$$.callbacks[type] = []));
            callbacks.push(callback);
            return () => {
                const index = callbacks.indexOf(callback);
                if (index !== -1)
                    callbacks.splice(index, 1);
            };
        }
        $set() {
            // overridden by instance, if it has props
        }
    }

    const Utils = {
      text(text) {
        if (typeof text === 'undefined' || text === null) return '';
        return text;
      },
      noUndefinedProps(obj) {
        const o = {};
        Object.keys(obj).forEach((key) => {
          if (typeof obj[key] !== 'undefined') o[key] = obj[key];
        });
        return o;
      },
      isTrueProp(val) {
        return val === true || val === '';
      },
      isStringProp(val) {
        return typeof val === 'string' && val !== '';
      },
      isObject(o) {
        return typeof o === 'object' && o !== null && o.constructor && o.constructor === Object;
      },
      now() {
        return Date.now();
      },
      extend(...args) {
        let deep = true;
        let to;
        let from;
        if (typeof args[0] === 'boolean') {
          [deep, to] = args;
          args.splice(0, 2);
          from = args;
        } else {
          [to] = args;
          args.splice(0, 1);
          from = args;
        }
        for (let i = 0; i < from.length; i += 1) {
          const nextSource = args[i];
          if (nextSource !== undefined && nextSource !== null) {
            const keysArray = Object.keys(Object(nextSource));
            for (let nextIndex = 0, len = keysArray.length; nextIndex < len; nextIndex += 1) {
              const nextKey = keysArray[nextIndex];
              const desc = Object.getOwnPropertyDescriptor(nextSource, nextKey);
              if (desc !== undefined && desc.enumerable) {
                if (!deep) {
                  to[nextKey] = nextSource[nextKey];
                } else if (Utils.isObject(to[nextKey]) && Utils.isObject(nextSource[nextKey])) {
                  Utils.extend(to[nextKey], nextSource[nextKey]);
                } else if (!Utils.isObject(to[nextKey]) && Utils.isObject(nextSource[nextKey])) {
                  to[nextKey] = {};
                  Utils.extend(to[nextKey], nextSource[nextKey]);
                } else {
                  to[nextKey] = nextSource[nextKey];
                }
              }
            }
          }
        }
        return to;
      },
      flattenArray(...args) {
        const arr = [];
        args.forEach((arg) => {
          if (Array.isArray(arg)) arr.push(...Utils.flattenArray(...arg));
          else arr.push(arg);
        });
        return arr;
      },
      classNames(...args) {
        const classes = [];
        args.forEach((arg) => {
          if (typeof arg === 'object' && arg.constructor === Object) {
            Object.keys(arg).forEach((key) => {
              if (arg[key]) classes.push(key);
            });
          } else if (arg) classes.push(arg);
        });
        const uniqueClasses = [];
        classes.forEach((c) => {
          if (uniqueClasses.indexOf(c) < 0) uniqueClasses.push(c);
        });
        return uniqueClasses.join(' ');
      },
      bindMethods(context, methods = []) {
        for (let i = 0; i < methods.length; i += 1) {
          if (context[methods[i]]) context[methods[i]] = context[methods[i]].bind(context);
        }
      },
    };

    const Mixins = {
      colorProps: {
        color: String,
        colorTheme: String,
        textColor: String,
        bgColor: String,
        borderColor: String,
        rippleColor: String,
        themeDark: Boolean,
      },
      colorClasses(props) {
        const {
          color,
          colorTheme,
          textColor,
          bgColor,
          borderColor,
          rippleColor,
          themeDark,
        } = props;

        return {
          'theme-dark': themeDark,
          [`color-${color}`]: color,
          [`color-theme-${colorTheme}`]: colorTheme,
          [`text-color-${textColor}`]: textColor,
          [`bg-color-${bgColor}`]: bgColor,
          [`border-color-${borderColor}`]: borderColor,
          [`ripple-color-${rippleColor}`]: rippleColor,
        };
      },
      linkIconProps: {
        icon: String,
        iconMaterial: String,
        iconF7: String,
        iconIos: String,
        iconMd: String,
        iconAurora: String,
        iconColor: String,
        iconSize: [String, Number],
      },
      linkRouterProps: {
        back: Boolean,
        external: Boolean,
        force: Boolean,
        animate: {
          type: Boolean,
          default: undefined,
        },
        ignoreCache: Boolean,
        reloadCurrent: Boolean,
        reloadAll: Boolean,
        reloadPrevious: Boolean,
        reloadDetail: {
          type: Boolean,
          default: undefined,
        },
        routeTabId: String,
        view: String,
        routeProps: Object,
        preventRouter: Boolean,
        transition: String,
      },
      linkRouterAttrs(props) {
        const {
          force,
          reloadCurrent,
          reloadPrevious,
          reloadAll,
          reloadDetail,
          animate,
          ignoreCache,
          routeTabId,
          view,
          transition,
        } = props;

        let dataAnimate;
        if ('animate' in props && typeof animate !== 'undefined') {
          dataAnimate = animate.toString();
        }

        let dataReloadDetail;
        if ('reloadDetail' in props && typeof reloadDetail !== 'undefined') {
          dataReloadDetail = reloadDetail.toString();
        }

        return {
          'data-force': force || undefined,
          'data-reload-current': reloadCurrent || undefined,
          'data-reload-all': reloadAll || undefined,
          'data-reload-previous': reloadPrevious || undefined,
          'data-reload-detail': dataReloadDetail,
          'data-animate': dataAnimate,
          'data-ignore-cache': ignoreCache || undefined,
          'data-route-tab-id': routeTabId || undefined,
          'data-view': Utils.isStringProp(view) ? view : undefined,
          'data-transition': Utils.isStringProp(transition) ? transition : undefined,
        };
      },
      linkRouterClasses(props) {
        const { back, linkBack, external, preventRouter } = props;

        return {
          back: back || linkBack,
          external,
          'prevent-router': preventRouter,
        };
      },
      linkActionsProps: {
        searchbarEnable: [Boolean, String],
        searchbarDisable: [Boolean, String],

        searchbarClear: [Boolean, String],
        searchbarToggle: [Boolean, String],

        // Panel
        panelOpen: [Boolean, String],
        panelClose: [Boolean, String],
        panelToggle: [Boolean, String],

        // Popup
        popupOpen: [Boolean, String],
        popupClose: [Boolean, String],

        // Actions
        actionsOpen: [Boolean, String],
        actionsClose: [Boolean, String],

        // Popover
        popoverOpen: [Boolean, String],
        popoverClose: [Boolean, String],

        // Login Screen
        loginScreenOpen: [Boolean, String],
        loginScreenClose: [Boolean, String],

        // Picker
        sheetOpen: [Boolean, String],
        sheetClose: [Boolean, String],

        // Sortable
        sortableEnable: [Boolean, String],
        sortableDisable: [Boolean, String],
        sortableToggle: [Boolean, String],

        // Card
        cardOpen: [Boolean, String],
        cardPreventOpen: [Boolean, String],
        cardClose: [Boolean, String],

        // Menu
        menuClose: {
          type: [Boolean, String],
          default: undefined,
        },
      },
      linkActionsAttrs(props) {
        const {
          searchbarEnable,
          searchbarDisable,
          searchbarClear,
          searchbarToggle,
          panelOpen,
          panelClose,
          panelToggle,
          popupOpen,
          popupClose,
          actionsOpen,
          actionsClose,
          popoverOpen,
          popoverClose,
          loginScreenOpen,
          loginScreenClose,
          sheetOpen,
          sheetClose,
          sortableEnable,
          sortableDisable,
          sortableToggle,
          cardOpen,
          cardClose,
        } = props;

        return {
          'data-searchbar': (Utils.isStringProp(searchbarEnable) && searchbarEnable)
                            || (Utils.isStringProp(searchbarDisable) && searchbarDisable)
                            || (Utils.isStringProp(searchbarClear) && searchbarClear)
                            || (Utils.isStringProp(searchbarToggle) && searchbarToggle) || undefined,
          'data-panel': (Utils.isStringProp(panelOpen) && panelOpen)
                        || (Utils.isStringProp(panelClose) && panelClose)
                        || (Utils.isStringProp(panelToggle) && panelToggle) || undefined,
          'data-popup': (Utils.isStringProp(popupOpen) && popupOpen)
                        || (Utils.isStringProp(popupClose) && popupClose) || undefined,
          'data-actions': (Utils.isStringProp(actionsOpen) && actionsOpen)
                        || (Utils.isStringProp(actionsClose) && actionsClose) || undefined,
          'data-popover': (Utils.isStringProp(popoverOpen) && popoverOpen)
                          || (Utils.isStringProp(popoverClose) && popoverClose) || undefined,
          'data-sheet': (Utils.isStringProp(sheetOpen) && sheetOpen)
                        || (Utils.isStringProp(sheetClose) && sheetClose) || undefined,
          'data-login-screen': (Utils.isStringProp(loginScreenOpen) && loginScreenOpen)
                               || (Utils.isStringProp(loginScreenClose) && loginScreenClose) || undefined,
          'data-sortable': (Utils.isStringProp(sortableEnable) && sortableEnable)
                           || (Utils.isStringProp(sortableDisable) && sortableDisable)
                           || (Utils.isStringProp(sortableToggle) && sortableToggle) || undefined,
          'data-card': (Utils.isStringProp(cardOpen) && cardOpen)
                        || (Utils.isStringProp(cardClose) && cardClose) || undefined,
        };
      },
      linkActionsClasses(props) {
        const {
          searchbarEnable,
          searchbarDisable,
          searchbarClear,
          searchbarToggle,
          panelOpen,
          panelClose,
          panelToggle,
          popupOpen,
          popupClose,
          actionsClose,
          actionsOpen,
          popoverOpen,
          popoverClose,
          loginScreenOpen,
          loginScreenClose,
          sheetOpen,
          sheetClose,
          sortableEnable,
          sortableDisable,
          sortableToggle,
          cardOpen,
          cardPreventOpen,
          cardClose,
          menuClose,
        } = props;

        return {
          'searchbar-enable': searchbarEnable || searchbarEnable === '',
          'searchbar-disable': searchbarDisable || searchbarDisable === '',
          'searchbar-clear': searchbarClear || searchbarClear === '',
          'searchbar-toggle': searchbarToggle || searchbarToggle === '',
          'panel-close': panelClose || panelClose === '',
          'panel-open': panelOpen || panelOpen === '',
          'panel-toggle': panelToggle || panelToggle === '',
          'popup-close': popupClose || popupClose === '',
          'popup-open': popupOpen || popupOpen === '',
          'actions-close': actionsClose || actionsClose === '',
          'actions-open': actionsOpen || actionsOpen === '',
          'popover-close': popoverClose || popoverClose === '',
          'popover-open': popoverOpen || popoverOpen === '',
          'sheet-close': sheetClose || sheetClose === '',
          'sheet-open': sheetOpen || sheetOpen === '',
          'login-screen-close': loginScreenClose || loginScreenClose === '',
          'login-screen-open': loginScreenOpen || loginScreenOpen === '',
          'sortable-enable': sortableEnable || sortableEnable === '',
          'sortable-disable': sortableDisable || sortableDisable === '',
          'sortable-toggle': sortableToggle || sortableToggle === '',
          'card-close': cardClose || cardClose === '',
          'card-open': cardOpen || cardOpen === '',
          'card-prevent-open': cardPreventOpen || cardPreventOpen === '',
          'menu-close': menuClose || menuClose === '',
        };
      },
    };

    function restProps(rest = {}) {
      const props = {};
      Object.keys(rest).forEach((key) => {
        if (key.indexOf('on') !== 0) {
          props[key] = rest[key];
        }
      });
      return props;
    }

    // eslint-disable-next-line
    let f7Instance;

    const f7 = {
      instance: null,
      Framework7: null,
      events: null,
      init(rootEl, params = {}, routes) {
        const { events, Framework7 } = f7;
        const f7Params = Utils.extend({}, params, {
          root: rootEl,
        });
        if (routes && routes.length && !f7Params.routes) f7Params.routes = routes;

        const instance = new Framework7(f7Params);
        f7Instance = instance;
        if (instance.initialized) {
          f7.instance = instance;
          f7Instance = instance;
          events.emit('ready', f7.instance);
        } else {
          instance.on('init', () => {
            f7.instance = instance;
            f7Instance = instance;
            events.emit('ready', f7.instance);
          });
        }
      },
      ready(callback) {
        if (!callback) return;
        if (f7.instance) callback(f7.instance);
        else {
          f7.events.once('ready', callback);
        }
      },
      routers: {
        views: [],
        tabs: [],
        modals: null,
      },
    };

    function hasSlots (args, name) {
      return args && args[1] && args[1].$$slots && args[1].$$slots[name] && args[1].$$slots[name].length > 0;
    }

    /* public/packages/svelte/components/routable-modals.svelte generated by Svelte v3.22.3 */

    function get_each_context(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[5] = list[i];
    	return child_ctx;
    }

    // (33:2) {#each modals as modal (modal.id)}
    function create_each_block(key_1, ctx) {
    	let first;
    	let switch_instance_anchor;
    	let current;
    	const switch_instance_spread_levels = [/*modal*/ ctx[5].props];
    	var switch_value = /*modal*/ ctx[5].component;

    	function switch_props(ctx) {
    		let switch_instance_props = {};

    		for (let i = 0; i < switch_instance_spread_levels.length; i += 1) {
    			switch_instance_props = assign(switch_instance_props, switch_instance_spread_levels[i]);
    		}

    		return { props: switch_instance_props };
    	}

    	if (switch_value) {
    		var switch_instance = new switch_value(switch_props());
    	}

    	return {
    		key: key_1,
    		first: null,
    		c() {
    			first = empty();
    			if (switch_instance) create_component(switch_instance.$$.fragment);
    			switch_instance_anchor = empty();
    			this.first = first;
    		},
    		m(target, anchor) {
    			insert(target, first, anchor);

    			if (switch_instance) {
    				mount_component(switch_instance, target, anchor);
    			}

    			insert(target, switch_instance_anchor, anchor);
    			current = true;
    		},
    		p(ctx, dirty) {
    			const switch_instance_changes = (dirty & /*modals*/ 1)
    			? get_spread_update(switch_instance_spread_levels, [get_spread_object(/*modal*/ ctx[5].props)])
    			: {};

    			if (switch_value !== (switch_value = /*modal*/ ctx[5].component)) {
    				if (switch_instance) {
    					group_outros();
    					const old_component = switch_instance;

    					transition_out(old_component.$$.fragment, 1, 0, () => {
    						destroy_component(old_component, 1);
    					});

    					check_outros();
    				}

    				if (switch_value) {
    					switch_instance = new switch_value(switch_props());
    					create_component(switch_instance.$$.fragment);
    					transition_in(switch_instance.$$.fragment, 1);
    					mount_component(switch_instance, switch_instance_anchor.parentNode, switch_instance_anchor);
    				} else {
    					switch_instance = null;
    				}
    			} else if (switch_value) {
    				switch_instance.$set(switch_instance_changes);
    			}
    		},
    		i(local) {
    			if (current) return;
    			if (switch_instance) transition_in(switch_instance.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			if (switch_instance) transition_out(switch_instance.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(first);
    			if (detaching) detach(switch_instance_anchor);
    			if (switch_instance) destroy_component(switch_instance, detaching);
    		}
    	};
    }

    function create_fragment(ctx) {
    	let div;
    	let each_blocks = [];
    	let each_1_lookup = new Map();
    	let current;
    	let each_value = /*modals*/ ctx[0];
    	const get_key = ctx => /*modal*/ ctx[5].id;

    	for (let i = 0; i < each_value.length; i += 1) {
    		let child_ctx = get_each_context(ctx, each_value, i);
    		let key = get_key(child_ctx);
    		each_1_lookup.set(key, each_blocks[i] = create_each_block(key, child_ctx));
    	}

    	return {
    		c() {
    			div = element("div");

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			attr(div, "class", "framework7-modals");
    		},
    		m(target, anchor) {
    			insert(target, div, anchor);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].m(div, null);
    			}

    			/*div_binding*/ ctx[4](div);
    			current = true;
    		},
    		p(ctx, [dirty]) {
    			if (dirty & /*modals*/ 1) {
    				const each_value = /*modals*/ ctx[0];
    				group_outros();
    				each_blocks = update_keyed_each(each_blocks, dirty, get_key, 1, ctx, each_value, each_1_lookup, div, outro_and_destroy_block, create_each_block, null, get_each_context);
    				check_outros();
    			}
    		},
    		i(local) {
    			if (current) return;

    			for (let i = 0; i < each_value.length; i += 1) {
    				transition_in(each_blocks[i]);
    			}

    			current = true;
    		},
    		o(local) {
    			for (let i = 0; i < each_blocks.length; i += 1) {
    				transition_out(each_blocks[i]);
    			}

    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(div);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].d();
    			}

    			/*div_binding*/ ctx[4](null);
    		}
    	};
    }

    function instance($$self, $$props, $$invalidate) {
    	let modals = [];
    	let el;
    	let routerData;

    	onMount(() => {
    		routerData = {
    			el,
    			modals,
    			setModals(m) {
    				tick().then(() => {
    					$$invalidate(0, modals = m);
    				});
    			}
    		};

    		f7.routers.modals = routerData;
    	});

    	afterUpdate(() => {
    		if (!routerData) return;
    		f7.events.emit("modalsRouterDidUpdate", routerData);
    	});

    	onDestroy(() => {
    		if (!routerData) return;
    		f7.routers.modals = null;
    		routerData = null;
    	});

    	function div_binding($$value) {
    		binding_callbacks[$$value ? "unshift" : "push"](() => {
    			$$invalidate(1, el = $$value);
    		});
    	}

    	return [modals, el, f7, routerData, div_binding];
    }

    class Routable_modals extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance, create_fragment, safe_not_equal, {});
    	}
    }

    /* public/packages/svelte/components/app.svelte generated by Svelte v3.22.3 */

    function create_fragment$1(ctx) {
    	let div;
    	let t;
    	let current;
    	const default_slot_template = /*$$slots*/ ctx[9].default;
    	const default_slot = create_slot(default_slot_template, ctx, /*$$scope*/ ctx[8], null);
    	const routablemodals = new Routable_modals({});

    	let div_levels = [
    		{ id: /*id*/ ctx[0] },
    		{ class: /*classes*/ ctx[2] },
    		restProps(/*$$restProps*/ ctx[3])
    	];

    	let div_data = {};

    	for (let i = 0; i < div_levels.length; i += 1) {
    		div_data = assign(div_data, div_levels[i]);
    	}

    	return {
    		c() {
    			div = element("div");
    			if (default_slot) default_slot.c();
    			t = space();
    			create_component(routablemodals.$$.fragment);
    			set_attributes(div, div_data);
    		},
    		m(target, anchor) {
    			insert(target, div, anchor);

    			if (default_slot) {
    				default_slot.m(div, null);
    			}

    			append(div, t);
    			mount_component(routablemodals, div, null);
    			/*div_binding*/ ctx[10](div);
    			current = true;
    		},
    		p(ctx, [dirty]) {
    			if (default_slot) {
    				if (default_slot.p && dirty & /*$$scope*/ 256) {
    					default_slot.p(get_slot_context(default_slot_template, ctx, /*$$scope*/ ctx[8], null), get_slot_changes(default_slot_template, /*$$scope*/ ctx[8], dirty, null));
    				}
    			}

    			set_attributes(div, get_spread_update(div_levels, [
    				dirty & /*id*/ 1 && { id: /*id*/ ctx[0] },
    				dirty & /*classes*/ 4 && { class: /*classes*/ ctx[2] },
    				dirty & /*restProps, $$restProps*/ 8 && restProps(/*$$restProps*/ ctx[3])
    			]));
    		},
    		i(local) {
    			if (current) return;
    			transition_in(default_slot, local);
    			transition_in(routablemodals.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(default_slot, local);
    			transition_out(routablemodals.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(div);
    			if (default_slot) default_slot.d(detaching);
    			destroy_component(routablemodals);
    			/*div_binding*/ ctx[10](null);
    		}
    	};
    }

    function instance$1($$self, $$props, $$invalidate) {
    	const omit_props_names = ["id","params","routes","class"];
    	let $$restProps = compute_rest_props($$props, omit_props_names);
    	let { id = "framework7-root" } = $$props;
    	let { params = {} } = $$props;
    	let { routes = [] } = $$props;
    	let { class: className = undefined } = $$props;
    	let el;

    	onMount(() => {
    		const parentEl = el.parentNode;

    		if (parentEl && parentEl !== document.body && parentEl.parentNode === document.body) {
    			parentEl.style.height = "100%";
    		}

    		if (f7.instance) return;
    		f7.init(el, params, routes);
    	});

    	let { $$slots = {}, $$scope } = $$props;

    	function div_binding($$value) {
    		binding_callbacks[$$value ? "unshift" : "push"](() => {
    			$$invalidate(1, el = $$value);
    		});
    	}

    	$$self.$set = $$new_props => {
    		$$invalidate(7, $$props = assign(assign({}, $$props), exclude_internal_props($$new_props)));
    		$$invalidate(3, $$restProps = compute_rest_props($$props, omit_props_names));
    		if ("id" in $$new_props) $$invalidate(0, id = $$new_props.id);
    		if ("params" in $$new_props) $$invalidate(4, params = $$new_props.params);
    		if ("routes" in $$new_props) $$invalidate(5, routes = $$new_props.routes);
    		if ("class" in $$new_props) $$invalidate(6, className = $$new_props.class);
    		if ("$$scope" in $$new_props) $$invalidate(8, $$scope = $$new_props.$$scope);
    	};

    	let classes;

    	$$self.$$.update = () => {
    		 $$invalidate(2, classes = Utils.classNames(className, "framework7-root", Mixins.colorClasses($$props)));
    	};

    	$$props = exclude_internal_props($$props);

    	return [
    		id,
    		el,
    		classes,
    		$$restProps,
    		params,
    		routes,
    		className,
    		$$props,
    		$$scope,
    		$$slots,
    		div_binding
    	];
    }

    class App extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance$1, create_fragment$1, safe_not_equal, { id: 0, params: 4, routes: 5, class: 6 });
    	}
    }

    /* public/packages/svelte/components/badge.svelte generated by Svelte v3.22.3 */

    function create_fragment$2(ctx) {
    	let span;
    	let current;
    	const default_slot_template = /*$$slots*/ ctx[11].default;
    	const default_slot = create_slot(default_slot_template, ctx, /*$$scope*/ ctx[10], null);
    	let span_levels = [{ class: /*classes*/ ctx[0] }, restProps(/*$$restProps*/ ctx[1])];
    	let span_data = {};

    	for (let i = 0; i < span_levels.length; i += 1) {
    		span_data = assign(span_data, span_levels[i]);
    	}

    	return {
    		c() {
    			span = element("span");
    			if (default_slot) default_slot.c();
    			set_attributes(span, span_data);
    		},
    		m(target, anchor) {
    			insert(target, span, anchor);

    			if (default_slot) {
    				default_slot.m(span, null);
    			}

    			current = true;
    		},
    		p(ctx, [dirty]) {
    			if (default_slot) {
    				if (default_slot.p && dirty & /*$$scope*/ 1024) {
    					default_slot.p(get_slot_context(default_slot_template, ctx, /*$$scope*/ ctx[10], null), get_slot_changes(default_slot_template, /*$$scope*/ ctx[10], dirty, null));
    				}
    			}

    			set_attributes(span, get_spread_update(span_levels, [
    				dirty & /*classes*/ 1 && { class: /*classes*/ ctx[0] },
    				dirty & /*restProps, $$restProps*/ 2 && restProps(/*$$restProps*/ ctx[1])
    			]));
    		},
    		i(local) {
    			if (current) return;
    			transition_in(default_slot, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(default_slot, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(span);
    			if (default_slot) default_slot.d(detaching);
    		}
    	};
    }

    function instance$2($$self, $$props, $$invalidate) {
    	const omit_props_names = ["class","tooltip","tooltipTrigger"];
    	let $$restProps = compute_rest_props($$props, omit_props_names);
    	let { class: className = undefined } = $$props;
    	let { tooltip = undefined } = $$props;
    	let { tooltipTrigger = undefined } = $$props;
    	let el;
    	let f7Tooltip;
    	let tooltipText = tooltip;

    	function watchTooltip(newText) {
    		const oldText = tooltipText;
    		if (oldText === newText) return;
    		tooltipText = newText;

    		if (!newText && f7Tooltip) {
    			f7Tooltip.destroy();
    			f7Tooltip = null;
    			return;
    		}

    		if (newText && !f7Tooltip && f7.instance) {
    			f7Tooltip = f7.instance.tooltip.create({
    				targetEl: el,
    				text: newText,
    				trigger: tooltipTrigger
    			});

    			return;
    		}

    		if (!newText || !f7Tooltip) return;
    		f7Tooltip.setText(newText);
    	}

    	onMount(() => {
    		if (!tooltip) return;

    		f7.ready(() => {
    			f7Tooltip = f7.instance.tooltip.create({
    				targetEl: el,
    				text: tooltip,
    				trigger: tooltipTrigger
    			});
    		});
    	});

    	onDestroy(() => {
    		if (f7Tooltip && f7Tooltip.destroy) {
    			f7Tooltip.destroy();
    			f7Tooltip = null;
    		}
    	});

    	let { $$slots = {}, $$scope } = $$props;

    	$$self.$set = $$new_props => {
    		$$invalidate(9, $$props = assign(assign({}, $$props), exclude_internal_props($$new_props)));
    		$$invalidate(1, $$restProps = compute_rest_props($$props, omit_props_names));
    		if ("class" in $$new_props) $$invalidate(2, className = $$new_props.class);
    		if ("tooltip" in $$new_props) $$invalidate(3, tooltip = $$new_props.tooltip);
    		if ("tooltipTrigger" in $$new_props) $$invalidate(4, tooltipTrigger = $$new_props.tooltipTrigger);
    		if ("$$scope" in $$new_props) $$invalidate(10, $$scope = $$new_props.$$scope);
    	};

    	let classes;

    	$$self.$$.update = () => {
    		 $$invalidate(0, classes = Utils.classNames(className, "badge", Mixins.colorClasses($$props)));

    		if ($$self.$$.dirty & /*tooltip*/ 8) {
    			 watchTooltip(tooltip);
    		}
    	};

    	$$props = exclude_internal_props($$props);

    	return [
    		classes,
    		$$restProps,
    		className,
    		tooltip,
    		tooltipTrigger,
    		f7Tooltip,
    		tooltipText,
    		el,
    		watchTooltip,
    		$$props,
    		$$scope,
    		$$slots
    	];
    }

    class Badge extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance$2, create_fragment$2, safe_not_equal, { class: 2, tooltip: 3, tooltipTrigger: 4 });
    	}
    }

    /* eslint no-underscore-dangle: "off" */

    let routerComponentIdCounter = 0;

    var componentsRouter = {
      proto: {
        pageComponentLoader(routerEl, component, componentUrl, options, resolve, reject) {
          const router = this;
          const el = routerEl;
          let viewRouter;
          f7.routers.views.forEach((data) => {
            if (data.el && data.el === routerEl) {
              viewRouter = data;
            }
          });

          if (!viewRouter) {
            reject();
            return;
          }

          const id = `${Utils.now()}_${(routerComponentIdCounter += 1)}`;
          const pageData = {
            component,
            id,
            props: Utils.extend(
              {
                f7route: options.route,
                $f7route: options.route,
                f7router: router,
                $f7router: router,
              },
              options.route.params,
              options.props || {},
            ),
          };
          if (viewRouter.component) {
            viewRouter.component.$f7router = router;
            viewRouter.component.$f7route = options.route;
          }

          let resolved;
          function onDidUpdate(componentRouterData) {
            if (componentRouterData !== viewRouter || resolved) return;
            f7.events.off('viewRouterDidUpdate', onDidUpdate);

            const pageEl = el.children[el.children.length - 1];
            pageData.el = pageEl;

            resolve(pageEl);
            resolved = true;
          }

          f7.events.on('viewRouterDidUpdate', onDidUpdate);

          viewRouter.pages.push(pageData);
          viewRouter.setPages(viewRouter.pages);
        },
        removePage($pageEl) {
          if (!$pageEl) return;
          const router = this;
          let f7Page;
          if ('length' in $pageEl && $pageEl[0]) f7Page = $pageEl[0].f7Page;
          else f7Page = $pageEl.f7Page;
          if (f7Page && f7Page.route && f7Page.route.route && f7Page.route.route.keepAlive) {
            router.app.$($pageEl).remove();
            return;
          }
          let viewRouter;
          f7.routers.views.forEach((data) => {
            if (data.el && data.el === router.el) {
              viewRouter = data;
            }
          });

          let pageEl;
          if ('length' in $pageEl) {
            // Dom7
            if ($pageEl.length === 0) return;
            pageEl = $pageEl[0];
          } else {
            pageEl = $pageEl;
          }
          if (!pageEl) return;

          let pageComponentFound;
          viewRouter.pages.forEach((page, index) => {
            if (page.el === pageEl) {
              pageComponentFound = true;
              viewRouter.pages.splice(index, 1);
              viewRouter.setPages(viewRouter.pages);
            }
          });
          if (!pageComponentFound) {
            pageEl.parentNode.removeChild(pageEl);
          }
        },
        tabComponentLoader(tabEl, component, componentUrl, options, resolve, reject) {
          const router = this;
          if (!tabEl) reject();

          let tabRouter;
          f7.routers.tabs.forEach((tabData) => {
            if (tabData.el && tabData.el === tabEl) {
              tabRouter = tabData;
            }
          });
          if (!tabRouter) {
            reject();
            return;
          }

          const id = `${Utils.now()}_${(routerComponentIdCounter += 1)}`;
          const tabContent = {
            id,
            component,
            props: Utils.extend(
              {
                f7route: options.route,
                $f7route: options.route,
                f7router: router,
                $f7router: router,
              },
              options.route.params,
              options.props || {},
            ),
          };

          if (tabRouter.component) {
            tabRouter.component.$f7router = router;
            tabRouter.component.$f7route = options.route;
          }

          let resolved;
          function onDidUpdate(componentRouterData) {
            if (componentRouterData !== tabRouter || resolved) return;
            f7.events.off('tabRouterDidUpdate', onDidUpdate);

            const tabContentEl = tabEl.children[0];
            resolve(tabContentEl);

            resolved = true;
          }

          f7.events.on('tabRouterDidUpdate', onDidUpdate);

          tabRouter.setTabContent(tabContent);
        },
        removeTabContent(tabEl) {
          if (!tabEl) return;

          let tabRouter;
          f7.routers.tabs.forEach((tabData) => {
            if (tabData.el && tabData.el === tabEl) {
              tabRouter = tabData;
            }
          });
          const hasComponent = tabRouter && tabRouter.component;
          if (!tabRouter || !hasComponent) {
            tabEl.innerHTML = ''; // eslint-disable-line
            return;
          }
          tabRouter.setTabContent(null);
        },
        modalComponentLoader(rootEl, component, componentUrl, options, resolve, reject) {
          const router = this;
          const modalsRouter = f7.routers.modals;

          if (!modalsRouter) {
            reject();
            return;
          }

          const id = `${Utils.now()}_${(routerComponentIdCounter += 1)}`;
          const modalData = {
            component,
            id,
            props: Utils.extend(
              {
                f7route: options.route,
                $f7route: options.route,
                f7router: router,
                $f7router: router,
              },
              options.route.params,
              options.props || {},
            ),
          };
          if (modalsRouter.component) {
            modalsRouter.component.$f7router = router;
            modalsRouter.component.$f7route = options.route;
          }

          let resolved;
          function onDidUpdate() {
            if (resolved) return;
            f7.events.off('modalsRouterDidUpdate', onDidUpdate);

            const modalEl = modalsRouter.el.children[modalsRouter.el.children.length - 1];
            modalData.el = modalEl;

            resolve(modalEl);
            resolved = true;
          }

          f7.events.on('modalsRouterDidUpdate', onDidUpdate);

          modalsRouter.modals.push(modalData);
          modalsRouter.setModals(modalsRouter.modals);
        },
        removeModal(modalEl) {
          const modalsRouter = f7.routers.modals;
          if (!modalsRouter) return;

          let modalDataToRemove;
          modalsRouter.modals.forEach((modalData) => {
            if (modalData.el === modalEl) modalDataToRemove = modalData;
          });

          modalsRouter.modals.splice(modalsRouter.modals.indexOf(modalDataToRemove), 1);
          modalsRouter.setModals(modalsRouter.modals);
        },
      },
    };

    /* eslint no-underscore-dangle: "off" */
    function f7ready(callback) {
      f7.ready(callback);
    }
    const f7Theme = {};
    const Plugin = {
      name: 'phenomePlugin',
      installed: false,
      install(params = {}) {
        if (Plugin.installed) return;
        Plugin.installed = true;
        const Framework7 = this;
        f7.Framework7 = Framework7;
        f7.events = new Framework7.Events();
        // eslint-disable-next-line
        
        const { theme } = params;
        if (theme === 'md') f7Theme.md = true;
        if (theme === 'ios') f7Theme.ios = true;
        if (theme === 'aurora') f7Theme.aurora = true;
        if (!theme || theme === 'auto') {
          f7Theme.ios = !!Framework7.device.ios;
          f7Theme.aurora = Framework7.device.desktop && Framework7.device.electron;
          f7Theme.md = !f7Theme.ios && !f7Theme.aurora;
        }
        f7.ready(() => {
          f7Theme.ios = f7.instance.theme === 'ios';
          f7Theme.md = f7.instance.theme === 'md';
          f7Theme.aurora = f7.instance.theme === 'aurora';
        });
        
        // Extend F7 Router
        Framework7.Router.use(componentsRouter);
      },
    };

    /* public/packages/svelte/components/icon.svelte generated by Svelte v3.22.3 */

    function create_fragment$3(ctx) {
    	let i;
    	let t0_value = (/*iconText*/ ctx[2] || "") + "";
    	let t0;
    	let t1;
    	let current;
    	const default_slot_template = /*$$slots*/ ctx[26].default;
    	const default_slot = create_slot(default_slot_template, ctx, /*$$scope*/ ctx[25], null);

    	let i_levels = [
    		{ style: /*iconStyle*/ ctx[3] },
    		{ class: /*iconClasses*/ ctx[1] },
    		restProps(/*$$restProps*/ ctx[4])
    	];

    	let i_data = {};

    	for (let i = 0; i < i_levels.length; i += 1) {
    		i_data = assign(i_data, i_levels[i]);
    	}

    	return {
    		c() {
    			i = element("i");
    			t0 = text(t0_value);
    			t1 = space();
    			if (default_slot) default_slot.c();
    			set_attributes(i, i_data);
    		},
    		m(target, anchor) {
    			insert(target, i, anchor);
    			append(i, t0);
    			append(i, t1);

    			if (default_slot) {
    				default_slot.m(i, null);
    			}

    			/*i_binding*/ ctx[27](i);
    			current = true;
    		},
    		p(ctx, [dirty]) {
    			if ((!current || dirty & /*iconText*/ 4) && t0_value !== (t0_value = (/*iconText*/ ctx[2] || "") + "")) set_data(t0, t0_value);

    			if (default_slot) {
    				if (default_slot.p && dirty & /*$$scope*/ 33554432) {
    					default_slot.p(get_slot_context(default_slot_template, ctx, /*$$scope*/ ctx[25], null), get_slot_changes(default_slot_template, /*$$scope*/ ctx[25], dirty, null));
    				}
    			}

    			set_attributes(i, get_spread_update(i_levels, [
    				dirty & /*iconStyle*/ 8 && { style: /*iconStyle*/ ctx[3] },
    				dirty & /*iconClasses*/ 2 && { class: /*iconClasses*/ ctx[1] },
    				dirty & /*restProps, $$restProps*/ 16 && restProps(/*$$restProps*/ ctx[4])
    			]));
    		},
    		i(local) {
    			if (current) return;
    			transition_in(default_slot, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(default_slot, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(i);
    			if (default_slot) default_slot.d(detaching);
    			/*i_binding*/ ctx[27](null);
    		}
    	};
    }

    function instance$3($$self, $$props, $$invalidate) {
    	const omit_props_names = [
    		"style","class","material","f7","icon","ios","aurora","md","tooltip","tooltipTrigger","size"
    	];

    	let $$restProps = compute_rest_props($$props, omit_props_names);
    	let { style = undefined } = $$props;
    	let { class: className = undefined } = $$props;
    	let { material = undefined } = $$props;
    	let { f7: f7$1 = undefined } = $$props;
    	let { icon = undefined } = $$props;
    	let { ios = undefined } = $$props;
    	let { aurora = undefined } = $$props;
    	let { md = undefined } = $$props;
    	let { tooltip = undefined } = $$props;
    	let { tooltipTrigger = undefined } = $$props;
    	let { size = undefined } = $$props;

    	// eslint-disable-next-line
    	let _theme = f7.instance ? f7Theme : null;

    	let el;
    	let f7Tooltip;
    	let classes = { icon: true };

    	if (!f7.instance) {
    		f7.ready(() => {
    			$$invalidate(16, _theme = f7Theme);
    		});
    	}

    	let themeIcon;

    	function iconTextComputed(t) {
    		let textComputed = material || f7$1;

    		if (md && t && t.md && (md.indexOf("material:") >= 0 || md.indexOf("f7:") >= 0)) {
    			textComputed = md.split(":")[1];
    		} else if (ios && t && t.ios && (ios.indexOf("material:") >= 0 || ios.indexOf("f7:") >= 0)) {
    			textComputed = ios.split(":")[1];
    		} else if (aurora && t && t.aurora && (aurora.indexOf("material:") >= 0 || aurora.indexOf("f7:") >= 0)) {
    			textComputed = aurora.split(":")[1];
    		}

    		return textComputed;
    	}

    	let tooltipText = tooltip;

    	function watchTooltip(newText) {
    		const oldText = tooltipText;
    		if (oldText === newText) return;
    		tooltipText = newText;

    		if (!newText && f7Tooltip) {
    			f7Tooltip.destroy();
    			f7Tooltip = null;
    			return;
    		}

    		if (newText && !f7Tooltip && f7.instance) {
    			f7Tooltip = f7.instance.tooltip.create({
    				targetEl: el,
    				text: newText,
    				trigger: tooltipTrigger
    			});

    			return;
    		}

    		if (!newText || !f7Tooltip) return;
    		f7Tooltip.setText(newText);
    	}

    	onMount(() => {
    		if (!tooltip) return;

    		f7.ready(() => {
    			f7Tooltip = f7.instance.tooltip.create({
    				targetEl: el,
    				text: tooltip,
    				trigger: tooltipTrigger
    			});
    		});
    	});

    	onDestroy(() => {
    		if (f7Tooltip && f7Tooltip.destroy) {
    			f7Tooltip.destroy();
    			f7Tooltip = null;
    		}
    	});

    	let { $$slots = {}, $$scope } = $$props;

    	function i_binding($$value) {
    		binding_callbacks[$$value ? "unshift" : "push"](() => {
    			$$invalidate(0, el = $$value);
    		});
    	}

    	$$self.$set = $$new_props => {
    		$$invalidate(24, $$props = assign(assign({}, $$props), exclude_internal_props($$new_props)));
    		$$invalidate(4, $$restProps = compute_rest_props($$props, omit_props_names));
    		if ("style" in $$new_props) $$invalidate(5, style = $$new_props.style);
    		if ("class" in $$new_props) $$invalidate(6, className = $$new_props.class);
    		if ("material" in $$new_props) $$invalidate(7, material = $$new_props.material);
    		if ("f7" in $$new_props) $$invalidate(8, f7$1 = $$new_props.f7);
    		if ("icon" in $$new_props) $$invalidate(9, icon = $$new_props.icon);
    		if ("ios" in $$new_props) $$invalidate(10, ios = $$new_props.ios);
    		if ("aurora" in $$new_props) $$invalidate(11, aurora = $$new_props.aurora);
    		if ("md" in $$new_props) $$invalidate(12, md = $$new_props.md);
    		if ("tooltip" in $$new_props) $$invalidate(13, tooltip = $$new_props.tooltip);
    		if ("tooltipTrigger" in $$new_props) $$invalidate(14, tooltipTrigger = $$new_props.tooltipTrigger);
    		if ("size" in $$new_props) $$invalidate(15, size = $$new_props.size);
    		if ("$$scope" in $$new_props) $$invalidate(25, $$scope = $$new_props.$$scope);
    	};

    	let iconClasses;
    	let iconText;
    	let iconSize;
    	let iconStyle;

    	$$self.$$.update = () => {
    		if ($$self.$$.dirty & /*_theme, ios, md, aurora*/ 72704) {
    			 if (_theme) {
    				if (_theme.ios) $$invalidate(19, themeIcon = ios);
    				if (_theme.md) $$invalidate(19, themeIcon = md);
    				if (_theme.aurora) $$invalidate(19, themeIcon = aurora);
    			}
    		}

    		if ($$self.$$.dirty & /*themeIcon, material, f7, icon*/ 525184) {
    			 if (themeIcon) {
    				const parts = themeIcon.split(":");
    				const prop = parts[0];
    				const value = parts[1];

    				if (prop === "material" || prop === "f7") {
    					$$invalidate(18, classes["material-icons"] = prop === "material", classes);
    					$$invalidate(18, classes["f7-icons"] = prop === "f7", classes);
    				}

    				if (prop === "icon") {
    					$$invalidate(18, classes[value] = true, classes);
    				}
    			} else {
    				$$invalidate(18, classes = {
    					icon: true,
    					"material-icons": material,
    					"f7-icons": f7$1
    				});

    				if (icon) $$invalidate(18, classes[icon] = true, classes);
    			}
    		}

    		 $$invalidate(1, iconClasses = Utils.classNames(className, classes, Mixins.colorClasses($$props)));

    		if ($$self.$$.dirty & /*_theme*/ 65536) {
    			 $$invalidate(2, iconText = iconTextComputed(_theme));
    		}

    		if ($$self.$$.dirty & /*size*/ 32768) {
    			 $$invalidate(21, iconSize = typeof size === "number" || parseFloat(size) === size * 1
    			? `${size}px`
    			: size);
    		}

    		if ($$self.$$.dirty & /*style, iconSize*/ 2097184) {
    			 $$invalidate(3, iconStyle = (style || "") + (iconSize
    			? `;font-size: ${iconSize}; width: ${iconSize}; height: ${iconSize}`.replace(";;", "")
    			: ""));
    		}

    		if ($$self.$$.dirty & /*tooltip*/ 8192) {
    			 watchTooltip(tooltip);
    		}
    	};

    	$$props = exclude_internal_props($$props);

    	return [
    		el,
    		iconClasses,
    		iconText,
    		iconStyle,
    		$$restProps,
    		style,
    		className,
    		material,
    		f7$1,
    		icon,
    		ios,
    		aurora,
    		md,
    		tooltip,
    		tooltipTrigger,
    		size,
    		_theme,
    		f7Tooltip,
    		classes,
    		themeIcon,
    		tooltipText,
    		iconSize,
    		iconTextComputed,
    		watchTooltip,
    		$$props,
    		$$scope,
    		$$slots,
    		i_binding
    	];
    }

    class Icon extends SvelteComponent {
    	constructor(options) {
    		super();

    		init(this, options, instance$3, create_fragment$3, safe_not_equal, {
    			style: 5,
    			class: 6,
    			material: 7,
    			f7: 8,
    			icon: 9,
    			ios: 10,
    			aurora: 11,
    			md: 12,
    			tooltip: 13,
    			tooltipTrigger: 14,
    			size: 15
    		});
    	}
    }

    /* public/packages/svelte/components/toggle.svelte generated by Svelte v3.22.3 */

    function create_fragment$4(ctx) {
    	let label;
    	let input;
    	let input_value_value;
    	let t;
    	let span;
    	let dispose;
    	let label_levels = [{ class: /*classes*/ ctx[7] }, restProps(/*$$restProps*/ ctx[9])];
    	let label_data = {};

    	for (let i = 0; i < label_levels.length; i += 1) {
    		label_data = assign(label_data, label_levels[i]);
    	}

    	return {
    		c() {
    			label = element("label");
    			input = element("input");
    			t = space();
    			span = element("span");
    			attr(input, "type", "checkbox");
    			attr(input, "name", /*name*/ ctx[3]);
    			input.disabled = /*disabled*/ ctx[1];
    			input.readOnly = /*readonly*/ ctx[2];
    			input.checked = /*checked*/ ctx[0];

    			input.value = input_value_value = typeof /*value*/ ctx[4] === "undefined"
    			? ""
    			: /*value*/ ctx[4];

    			attr(span, "class", "toggle-icon");
    			set_attributes(label, label_data);
    		},
    		m(target, anchor, remount) {
    			insert(target, label, anchor);
    			append(label, input);
    			/*input_binding*/ ctx[19](input);
    			append(label, t);
    			append(label, span);
    			/*label_binding*/ ctx[20](label);
    			if (remount) dispose();
    			dispose = listen(input, "change", /*onChange*/ ctx[8]);
    		},
    		p(ctx, [dirty]) {
    			if (dirty & /*name*/ 8) {
    				attr(input, "name", /*name*/ ctx[3]);
    			}

    			if (dirty & /*disabled*/ 2) {
    				input.disabled = /*disabled*/ ctx[1];
    			}

    			if (dirty & /*readonly*/ 4) {
    				input.readOnly = /*readonly*/ ctx[2];
    			}

    			if (dirty & /*checked*/ 1) {
    				input.checked = /*checked*/ ctx[0];
    			}

    			if (dirty & /*value*/ 16 && input_value_value !== (input_value_value = typeof /*value*/ ctx[4] === "undefined"
    			? ""
    			: /*value*/ ctx[4])) {
    				input.value = input_value_value;
    			}

    			set_attributes(label, get_spread_update(label_levels, [
    				dirty & /*classes*/ 128 && { class: /*classes*/ ctx[7] },
    				dirty & /*restProps, $$restProps*/ 512 && restProps(/*$$restProps*/ ctx[9])
    			]));
    		},
    		i: noop,
    		o: noop,
    		d(detaching) {
    			if (detaching) detach(label);
    			/*input_binding*/ ctx[19](null);
    			/*label_binding*/ ctx[20](null);
    			dispose();
    		}
    	};
    }

    function instance_1($$self, $$props, $$invalidate) {
    	const omit_props_names = [
    		"class","init","checked","disabled","readonly","name","value","instance","toggle"
    	];

    	let $$restProps = compute_rest_props($$props, omit_props_names);
    	const dispatch = createEventDispatcher();
    	let { class: className = undefined } = $$props;
    	let { init = true } = $$props;
    	let { checked = undefined } = $$props;
    	let { disabled = undefined } = $$props;
    	let { readonly = undefined } = $$props;
    	let { name = undefined } = $$props;
    	let { value = undefined } = $$props;
    	let el;
    	let inputEl;
    	let f7Toggle;

    	function instance() {
    		return f7Toggle;
    	}

    	function toggle() {
    		if (f7Toggle && f7Toggle.toggle) f7Toggle.toggle();
    	}

    	let initialWatched = false;

    	function watchChecked(isChecked) {
    		if (!initialWatched) {
    			initialWatched = true;
    			return;
    		}

    		if (!f7Toggle) return;
    		f7Toggle.checked = isChecked;
    	}

    	function onChange(event) {
    		dispatch("change", [event]);
    		if (typeof $$props.onChange === "function") $$props.onChange(event);
    	}

    	onMount(() => {
    		if (!init) return;

    		f7.ready(() => {
    			f7Toggle = f7.instance.toggle.create({
    				el,
    				on: {
    					change(toggle) {
    						dispatch("toggleChange", [toggle.checked]);
    						if (typeof $$props.onToggleChange === "function") $$props.onToggleChange(toggle.checked);
    					}
    				}
    			});
    		});
    	});

    	onDestroy(() => {
    		if (f7Toggle && f7Toggle.destroy && f7Toggle.$el) f7Toggle.destroy();
    	});

    	function input_binding($$value) {
    		binding_callbacks[$$value ? "unshift" : "push"](() => {
    			$$invalidate(6, inputEl = $$value);
    		});
    	}

    	function label_binding($$value) {
    		binding_callbacks[$$value ? "unshift" : "push"](() => {
    			$$invalidate(5, el = $$value);
    		});
    	}

    	$$self.$set = $$new_props => {
    		$$invalidate(18, $$props = assign(assign({}, $$props), exclude_internal_props($$new_props)));
    		$$invalidate(9, $$restProps = compute_rest_props($$props, omit_props_names));
    		if ("class" in $$new_props) $$invalidate(10, className = $$new_props.class);
    		if ("init" in $$new_props) $$invalidate(11, init = $$new_props.init);
    		if ("checked" in $$new_props) $$invalidate(0, checked = $$new_props.checked);
    		if ("disabled" in $$new_props) $$invalidate(1, disabled = $$new_props.disabled);
    		if ("readonly" in $$new_props) $$invalidate(2, readonly = $$new_props.readonly);
    		if ("name" in $$new_props) $$invalidate(3, name = $$new_props.name);
    		if ("value" in $$new_props) $$invalidate(4, value = $$new_props.value);
    	};

    	let classes;

    	$$self.$$.update = () => {
    		 $$invalidate(7, classes = Utils.classNames("toggle", className, { disabled }, Mixins.colorClasses($$props)));

    		if ($$self.$$.dirty & /*checked*/ 1) {
    			 watchChecked(checked);
    		}
    	};

    	$$props = exclude_internal_props($$props);

    	return [
    		checked,
    		disabled,
    		readonly,
    		name,
    		value,
    		el,
    		inputEl,
    		classes,
    		onChange,
    		$$restProps,
    		className,
    		init,
    		instance,
    		toggle,
    		f7Toggle,
    		initialWatched,
    		dispatch,
    		watchChecked,
    		$$props,
    		input_binding,
    		label_binding
    	];
    }

    class Toggle extends SvelteComponent {
    	constructor(options) {
    		super();

    		init(this, options, instance_1, create_fragment$4, safe_not_equal, {
    			class: 10,
    			init: 11,
    			checked: 0,
    			disabled: 1,
    			readonly: 2,
    			name: 3,
    			value: 4,
    			instance: 12,
    			toggle: 13
    		});
    	}

    	get instance() {
    		return this.$$.ctx[12];
    	}

    	get toggle() {
    		return this.$$.ctx[13];
    	}
    }

    /* public/packages/svelte/components/range.svelte generated by Svelte v3.22.3 */

    function create_if_block(ctx) {
    	let input_1;

    	return {
    		c() {
    			input_1 = element("input");
    			attr(input_1, "type", "range");
    			attr(input_1, "name", /*name*/ ctx[0]);
    			attr(input_1, "id", /*inputId*/ ctx[2]);
    		},
    		m(target, anchor) {
    			insert(target, input_1, anchor);
    		},
    		p(ctx, dirty) {
    			if (dirty[0] & /*name*/ 1) {
    				attr(input_1, "name", /*name*/ ctx[0]);
    			}

    			if (dirty[0] & /*inputId*/ 4) {
    				attr(input_1, "id", /*inputId*/ ctx[2]);
    			}
    		},
    		d(detaching) {
    			if (detaching) detach(input_1);
    		}
    	};
    }

    function create_fragment$5(ctx) {
    	let div;
    	let t;
    	let current;
    	let if_block = /*input*/ ctx[1] && create_if_block(ctx);
    	const default_slot_template = /*$$slots*/ ctx[32].default;
    	const default_slot = create_slot(default_slot_template, ctx, /*$$scope*/ ctx[31], null);
    	let div_levels = [{ class: /*classes*/ ctx[4] }, restProps(/*$$restProps*/ ctx[5])];
    	let div_data = {};

    	for (let i = 0; i < div_levels.length; i += 1) {
    		div_data = assign(div_data, div_levels[i]);
    	}

    	return {
    		c() {
    			div = element("div");
    			if (if_block) if_block.c();
    			t = space();
    			if (default_slot) default_slot.c();
    			set_attributes(div, div_data);
    		},
    		m(target, anchor) {
    			insert(target, div, anchor);
    			if (if_block) if_block.m(div, null);
    			append(div, t);

    			if (default_slot) {
    				default_slot.m(div, null);
    			}

    			/*div_binding*/ ctx[33](div);
    			current = true;
    		},
    		p(ctx, dirty) {
    			if (/*input*/ ctx[1]) {
    				if (if_block) {
    					if_block.p(ctx, dirty);
    				} else {
    					if_block = create_if_block(ctx);
    					if_block.c();
    					if_block.m(div, t);
    				}
    			} else if (if_block) {
    				if_block.d(1);
    				if_block = null;
    			}

    			if (default_slot) {
    				if (default_slot.p && dirty[1] & /*$$scope*/ 1) {
    					default_slot.p(get_slot_context(default_slot_template, ctx, /*$$scope*/ ctx[31], null), get_slot_changes(default_slot_template, /*$$scope*/ ctx[31], dirty, null));
    				}
    			}

    			set_attributes(div, get_spread_update(div_levels, [
    				dirty[0] & /*classes*/ 16 && { class: /*classes*/ ctx[4] },
    				dirty[0] & /*$$restProps*/ 32 && restProps(/*$$restProps*/ ctx[5])
    			]));
    		},
    		i(local) {
    			if (current) return;
    			transition_in(default_slot, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(default_slot, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(div);
    			if (if_block) if_block.d();
    			if (default_slot) default_slot.d(detaching);
    			/*div_binding*/ ctx[33](null);
    		}
    	};
    }

    function instance_1$1($$self, $$props, $$invalidate) {
    	const omit_props_names = [
    		"class","init","value","min","max","step","label","dual","vertical","verticalReversed","draggableBar","formatLabel","scale","scaleSteps","scaleSubSteps","formatScaleLabel","limitKnobPosition","name","input","inputId","disabled","instance","setValue","getValue"
    	];

    	let $$restProps = compute_rest_props($$props, omit_props_names);
    	const dispatch = createEventDispatcher();
    	let { class: className = undefined } = $$props;
    	let { init = true } = $$props;
    	let { value = 0 } = $$props;
    	let { min = 0 } = $$props;
    	let { max = 100 } = $$props;
    	let { step = 1 } = $$props;
    	let { label = false } = $$props;
    	let { dual = false } = $$props;
    	let { vertical = false } = $$props;
    	let { verticalReversed = false } = $$props;
    	let { draggableBar = true } = $$props;
    	let { formatLabel = undefined } = $$props;
    	let { scale = false } = $$props;
    	let { scaleSteps = 5 } = $$props;
    	let { scaleSubSteps = 0 } = $$props;
    	let { formatScaleLabel = undefined } = $$props;
    	let { limitKnobPosition = undefined } = $$props;
    	let { name = undefined } = $$props;
    	let { input = false } = $$props;
    	let { inputId = undefined } = $$props;
    	let { disabled = false } = $$props;
    	let el;
    	let f7Range;

    	function instance() {
    		return f7Range;
    	}

    	function setValue(newValue) {
    		if (f7Range && f7Range.setValue) f7Range.setValue(newValue);
    	}

    	function getValue() {
    		if (f7Range && f7Range.getValue) {
    			return f7Range.getValue();
    		}

    		return undefined;
    	}

    	function watchValue(newValue) {
    		if (!f7Range) return;
    		f7Range.setValue(newValue);
    	}

    	onMount(() => {
    		if (!init) return;

    		f7.ready(() => {
    			f7Range = f7.instance.range.create(Utils.noUndefinedProps({
    				el,
    				value,
    				min,
    				max,
    				step,
    				label,
    				dual,
    				draggableBar,
    				vertical,
    				verticalReversed,
    				formatLabel,
    				scale,
    				scaleSteps,
    				scaleSubSteps,
    				formatScaleLabel,
    				limitKnobPosition,
    				on: {
    					change(range, val) {
    						dispatch("rangeChange", [val]);
    						if (typeof $$props.onRangeChange === "function") $$props.onRangeChange(val);
    					},
    					changed(range, val) {
    						dispatch("rangeChanged", [val]);
    						if (typeof $$props.onRangeChanged === "function") $$props.onRangeChanged(val);
    					}
    				}
    			}));
    		});
    	});

    	onDestroy(() => {
    		if (f7Range && f7Range.destroy) f7Range.destroy();
    	});

    	let { $$slots = {}, $$scope } = $$props;

    	function div_binding($$value) {
    		binding_callbacks[$$value ? "unshift" : "push"](() => {
    			$$invalidate(3, el = $$value);
    		});
    	}

    	$$self.$set = $$new_props => {
    		$$invalidate(30, $$props = assign(assign({}, $$props), exclude_internal_props($$new_props)));
    		$$invalidate(5, $$restProps = compute_rest_props($$props, omit_props_names));
    		if ("class" in $$new_props) $$invalidate(6, className = $$new_props.class);
    		if ("init" in $$new_props) $$invalidate(7, init = $$new_props.init);
    		if ("value" in $$new_props) $$invalidate(8, value = $$new_props.value);
    		if ("min" in $$new_props) $$invalidate(9, min = $$new_props.min);
    		if ("max" in $$new_props) $$invalidate(10, max = $$new_props.max);
    		if ("step" in $$new_props) $$invalidate(11, step = $$new_props.step);
    		if ("label" in $$new_props) $$invalidate(12, label = $$new_props.label);
    		if ("dual" in $$new_props) $$invalidate(13, dual = $$new_props.dual);
    		if ("vertical" in $$new_props) $$invalidate(14, vertical = $$new_props.vertical);
    		if ("verticalReversed" in $$new_props) $$invalidate(15, verticalReversed = $$new_props.verticalReversed);
    		if ("draggableBar" in $$new_props) $$invalidate(16, draggableBar = $$new_props.draggableBar);
    		if ("formatLabel" in $$new_props) $$invalidate(17, formatLabel = $$new_props.formatLabel);
    		if ("scale" in $$new_props) $$invalidate(18, scale = $$new_props.scale);
    		if ("scaleSteps" in $$new_props) $$invalidate(19, scaleSteps = $$new_props.scaleSteps);
    		if ("scaleSubSteps" in $$new_props) $$invalidate(20, scaleSubSteps = $$new_props.scaleSubSteps);
    		if ("formatScaleLabel" in $$new_props) $$invalidate(21, formatScaleLabel = $$new_props.formatScaleLabel);
    		if ("limitKnobPosition" in $$new_props) $$invalidate(22, limitKnobPosition = $$new_props.limitKnobPosition);
    		if ("name" in $$new_props) $$invalidate(0, name = $$new_props.name);
    		if ("input" in $$new_props) $$invalidate(1, input = $$new_props.input);
    		if ("inputId" in $$new_props) $$invalidate(2, inputId = $$new_props.inputId);
    		if ("disabled" in $$new_props) $$invalidate(23, disabled = $$new_props.disabled);
    		if ("$$scope" in $$new_props) $$invalidate(31, $$scope = $$new_props.$$scope);
    	};

    	let classes;

    	$$self.$$.update = () => {
    		 $$invalidate(4, classes = Utils.classNames(
    			className,
    			"range-slider",
    			{
    				"range-slider-horizontal": !vertical,
    				"range-slider-vertical": vertical,
    				"range-slider-vertical-reversed": vertical && verticalReversed,
    				disabled
    			},
    			Mixins.colorClasses($$props)
    		));

    		if ($$self.$$.dirty[0] & /*value*/ 256) {
    			 watchValue(value);
    		}
    	};

    	$$props = exclude_internal_props($$props);

    	return [
    		name,
    		input,
    		inputId,
    		el,
    		classes,
    		$$restProps,
    		className,
    		init,
    		value,
    		min,
    		max,
    		step,
    		label,
    		dual,
    		vertical,
    		verticalReversed,
    		draggableBar,
    		formatLabel,
    		scale,
    		scaleSteps,
    		scaleSubSteps,
    		formatScaleLabel,
    		limitKnobPosition,
    		disabled,
    		instance,
    		setValue,
    		getValue,
    		f7Range,
    		dispatch,
    		watchValue,
    		$$props,
    		$$scope,
    		$$slots,
    		div_binding
    	];
    }

    class Range extends SvelteComponent {
    	constructor(options) {
    		super();

    		init(
    			this,
    			options,
    			instance_1$1,
    			create_fragment$5,
    			safe_not_equal,
    			{
    				class: 6,
    				init: 7,
    				value: 8,
    				min: 9,
    				max: 10,
    				step: 11,
    				label: 12,
    				dual: 13,
    				vertical: 14,
    				verticalReversed: 15,
    				draggableBar: 16,
    				formatLabel: 17,
    				scale: 18,
    				scaleSteps: 19,
    				scaleSubSteps: 20,
    				formatScaleLabel: 21,
    				limitKnobPosition: 22,
    				name: 0,
    				input: 1,
    				inputId: 2,
    				disabled: 23,
    				instance: 24,
    				setValue: 25,
    				getValue: 26
    			},
    			[-1, -1]
    		);
    	}

    	get instance() {
    		return this.$$.ctx[24];
    	}

    	get setValue() {
    		return this.$$.ctx[25];
    	}

    	get getValue() {
    		return this.$$.ctx[26];
    	}
    }

    /* public/packages/svelte/components/text-editor.svelte generated by Svelte v3.22.3 */
    const get_root_slot_changes = dirty => ({});
    const get_root_slot_context = ctx => ({});
    const get_root_end_slot_changes = dirty => ({});
    const get_root_end_slot_context = ctx => ({});
    const get_root_start_slot_changes = dirty => ({});
    const get_root_start_slot_context = ctx => ({});

    function create_fragment$6(ctx) {
    	let div1;
    	let t0;
    	let div0;
    	let t1;
    	let t2;
    	let current;
    	const root_start_slot_template = /*$$slots*/ ctx[29]["root-start"];
    	const root_start_slot = create_slot(root_start_slot_template, ctx, /*$$scope*/ ctx[28], get_root_start_slot_context);
    	const default_slot_template = /*$$slots*/ ctx[29].default;
    	const default_slot = create_slot(default_slot_template, ctx, /*$$scope*/ ctx[28], null);
    	const root_end_slot_template = /*$$slots*/ ctx[29]["root-end"];
    	const root_end_slot = create_slot(root_end_slot_template, ctx, /*$$scope*/ ctx[28], get_root_end_slot_context);
    	const root_slot_template = /*$$slots*/ ctx[29].root;
    	const root_slot = create_slot(root_slot_template, ctx, /*$$scope*/ ctx[28], get_root_slot_context);
    	let div1_levels = [{ class: /*classes*/ ctx[1] }, restProps(/*$$restProps*/ ctx[2])];
    	let div1_data = {};

    	for (let i = 0; i < div1_levels.length; i += 1) {
    		div1_data = assign(div1_data, div1_levels[i]);
    	}

    	return {
    		c() {
    			div1 = element("div");
    			if (root_start_slot) root_start_slot.c();
    			t0 = space();
    			div0 = element("div");
    			if (default_slot) default_slot.c();
    			t1 = space();
    			if (root_end_slot) root_end_slot.c();
    			t2 = space();
    			if (root_slot) root_slot.c();
    			attr(div0, "class", "text-editor-content");
    			attr(div0, "contenteditable", "");
    			set_attributes(div1, div1_data);
    		},
    		m(target, anchor) {
    			insert(target, div1, anchor);

    			if (root_start_slot) {
    				root_start_slot.m(div1, null);
    			}

    			append(div1, t0);
    			append(div1, div0);

    			if (default_slot) {
    				default_slot.m(div0, null);
    			}

    			append(div1, t1);

    			if (root_end_slot) {
    				root_end_slot.m(div1, null);
    			}

    			append(div1, t2);

    			if (root_slot) {
    				root_slot.m(div1, null);
    			}

    			/*div1_binding*/ ctx[30](div1);
    			current = true;
    		},
    		p(ctx, [dirty]) {
    			if (root_start_slot) {
    				if (root_start_slot.p && dirty & /*$$scope*/ 268435456) {
    					root_start_slot.p(get_slot_context(root_start_slot_template, ctx, /*$$scope*/ ctx[28], get_root_start_slot_context), get_slot_changes(root_start_slot_template, /*$$scope*/ ctx[28], dirty, get_root_start_slot_changes));
    				}
    			}

    			if (default_slot) {
    				if (default_slot.p && dirty & /*$$scope*/ 268435456) {
    					default_slot.p(get_slot_context(default_slot_template, ctx, /*$$scope*/ ctx[28], null), get_slot_changes(default_slot_template, /*$$scope*/ ctx[28], dirty, null));
    				}
    			}

    			if (root_end_slot) {
    				if (root_end_slot.p && dirty & /*$$scope*/ 268435456) {
    					root_end_slot.p(get_slot_context(root_end_slot_template, ctx, /*$$scope*/ ctx[28], get_root_end_slot_context), get_slot_changes(root_end_slot_template, /*$$scope*/ ctx[28], dirty, get_root_end_slot_changes));
    				}
    			}

    			if (root_slot) {
    				if (root_slot.p && dirty & /*$$scope*/ 268435456) {
    					root_slot.p(get_slot_context(root_slot_template, ctx, /*$$scope*/ ctx[28], get_root_slot_context), get_slot_changes(root_slot_template, /*$$scope*/ ctx[28], dirty, get_root_slot_changes));
    				}
    			}

    			set_attributes(div1, get_spread_update(div1_levels, [
    				dirty & /*classes*/ 2 && { class: /*classes*/ ctx[1] },
    				dirty & /*restProps, $$restProps*/ 4 && restProps(/*$$restProps*/ ctx[2])
    			]));
    		},
    		i(local) {
    			if (current) return;
    			transition_in(root_start_slot, local);
    			transition_in(default_slot, local);
    			transition_in(root_end_slot, local);
    			transition_in(root_slot, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(root_start_slot, local);
    			transition_out(default_slot, local);
    			transition_out(root_end_slot, local);
    			transition_out(root_slot, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(div1);
    			if (root_start_slot) root_start_slot.d(detaching);
    			if (default_slot) default_slot.d(detaching);
    			if (root_end_slot) root_end_slot.d(detaching);
    			if (root_slot) root_slot.d(detaching);
    			/*div1_binding*/ ctx[30](null);
    		}
    	};
    }

    function instance_1$2($$self, $$props, $$invalidate) {
    	const omit_props_names = [
    		"class","mode","value","buttons","customButtons","dividers","imageUrlText","linkUrlText","placeholder","clearFormattingOnPaste","resizable","instance"
    	];

    	let $$restProps = compute_rest_props($$props, omit_props_names);
    	const dispatch = createEventDispatcher();
    	let { class: className = undefined } = $$props;
    	let { mode = undefined } = $$props;
    	let { value = undefined } = $$props;
    	let { buttons = undefined } = $$props;
    	let { customButtons = undefined } = $$props;
    	let { dividers = undefined } = $$props;
    	let { imageUrlText = undefined } = $$props;
    	let { linkUrlText = undefined } = $$props;
    	let { placeholder = undefined } = $$props;
    	let { clearFormattingOnPaste = undefined } = $$props;
    	let { resizable = false } = $$props;
    	let el;
    	let f7TextEditor;

    	function instance() {
    		return f7TextEditor;
    	}

    	function watchValue(newValue) {
    		if (f7TextEditor) {
    			f7TextEditor.setValue(newValue);
    		}
    	}

    	function onChange(editor, editorValue) {
    		dispatch("textEditorChange", [editorValue]);
    		if (typeof $$props.onTextEditorChange === "function") $$props.onTextEditorChange(editorValue);
    	}

    	function onInput() {
    		dispatch("textEditorChange");
    		if (typeof $$props.onTextEditorChange === "function") $$props.onTextEditorChange();
    	}

    	function onFocus() {
    		dispatch("textEditorFocus");
    		if (typeof $$props.onTextEditorFocus === "function") $$props.onTextEditorFocus();
    	}

    	function onBlur() {
    		dispatch("textEditorBlur");
    		if (typeof $$props.onTextEditorBlur === "function") $$props.onTextEditorBlur();
    	}

    	function onButtonClick(editor, button) {
    		dispatch("textEditorButtonClick", [button]);
    		if (typeof $$props.onTextEditorButtonClick === "function") $$props.onTextEditorButtonClick(button);
    	}

    	function onKeyboardOpen() {
    		dispatch("textEditorKeyboardOpen");
    		if (typeof $$props.onTextEditorKeyboardOpen === "function") $$props.onTextEditorKeyboardOpen();
    	}

    	function onKeyboardClose() {
    		dispatch("textEditorKeyboardClose");
    		if (typeof $$props.onTextEditorKeyboardClose === "function") $$props.onTextEditorKeyboardClose();
    	}

    	function onPopoverOpen() {
    		dispatch("textEditorPopoverOpen");
    		if (typeof $$props.onTextEditorPopoverOpen === "function") $$props.onTextEditorPopoverOpen();
    	}

    	function onPopoverClose() {
    		dispatch("textEditorPopoverClose");
    		if (typeof $$props.onTextEditorPopoverClose === "function") $$props.onTextEditorPopoverClose();
    	}

    	onMount(() => {
    		const params = Utils.noUndefinedProps({
    			el,
    			mode,
    			value,
    			buttons,
    			customButtons,
    			dividers,
    			imageUrlText,
    			linkUrlText,
    			placeholder,
    			clearFormattingOnPaste,
    			on: {
    				change: onChange,
    				input: onInput,
    				focus: onFocus,
    				blur: onBlur,
    				buttonClick: onButtonClick,
    				keyboardOpen: onKeyboardOpen,
    				keyboardClose: onKeyboardClose,
    				popoverOpen: onPopoverOpen,
    				popoverClose: onPopoverClose
    			}
    		});

    		f7.ready(() => {
    			f7TextEditor = f7.instance.textEditor.create(params);
    		});
    	});

    	onDestroy(() => {
    		if (f7TextEditor && f7TextEditor.destroy) {
    			f7TextEditor.destroy();
    		}
    	});

    	let { $$slots = {}, $$scope } = $$props;

    	function div1_binding($$value) {
    		binding_callbacks[$$value ? "unshift" : "push"](() => {
    			$$invalidate(0, el = $$value);
    		});
    	}

    	$$self.$set = $$new_props => {
    		$$invalidate(27, $$props = assign(assign({}, $$props), exclude_internal_props($$new_props)));
    		$$invalidate(2, $$restProps = compute_rest_props($$props, omit_props_names));
    		if ("class" in $$new_props) $$invalidate(3, className = $$new_props.class);
    		if ("mode" in $$new_props) $$invalidate(4, mode = $$new_props.mode);
    		if ("value" in $$new_props) $$invalidate(5, value = $$new_props.value);
    		if ("buttons" in $$new_props) $$invalidate(6, buttons = $$new_props.buttons);
    		if ("customButtons" in $$new_props) $$invalidate(7, customButtons = $$new_props.customButtons);
    		if ("dividers" in $$new_props) $$invalidate(8, dividers = $$new_props.dividers);
    		if ("imageUrlText" in $$new_props) $$invalidate(9, imageUrlText = $$new_props.imageUrlText);
    		if ("linkUrlText" in $$new_props) $$invalidate(10, linkUrlText = $$new_props.linkUrlText);
    		if ("placeholder" in $$new_props) $$invalidate(11, placeholder = $$new_props.placeholder);
    		if ("clearFormattingOnPaste" in $$new_props) $$invalidate(12, clearFormattingOnPaste = $$new_props.clearFormattingOnPaste);
    		if ("resizable" in $$new_props) $$invalidate(13, resizable = $$new_props.resizable);
    		if ("$$scope" in $$new_props) $$invalidate(28, $$scope = $$new_props.$$scope);
    	};

    	let classes;

    	$$self.$$.update = () => {
    		 $$invalidate(1, classes = Utils.classNames(className, "text-editor", resizable && "text-editor-resizable", Mixins.colorClasses($$props)));

    		if ($$self.$$.dirty & /*value*/ 32) {
    			 watchValue(value);
    		}
    	};

    	$$props = exclude_internal_props($$props);

    	return [
    		el,
    		classes,
    		$$restProps,
    		className,
    		mode,
    		value,
    		buttons,
    		customButtons,
    		dividers,
    		imageUrlText,
    		linkUrlText,
    		placeholder,
    		clearFormattingOnPaste,
    		resizable,
    		instance,
    		f7TextEditor,
    		dispatch,
    		watchValue,
    		onChange,
    		onInput,
    		onFocus,
    		onBlur,
    		onButtonClick,
    		onKeyboardOpen,
    		onKeyboardClose,
    		onPopoverOpen,
    		onPopoverClose,
    		$$props,
    		$$scope,
    		$$slots,
    		div1_binding
    	];
    }

    class Text_editor extends SvelteComponent {
    	constructor(options) {
    		super();

    		init(this, options, instance_1$2, create_fragment$6, safe_not_equal, {
    			class: 3,
    			mode: 4,
    			value: 5,
    			buttons: 6,
    			customButtons: 7,
    			dividers: 8,
    			imageUrlText: 9,
    			linkUrlText: 10,
    			placeholder: 11,
    			clearFormattingOnPaste: 12,
    			resizable: 13,
    			instance: 14
    		});
    	}

    	get instance() {
    		return this.$$.ctx[14];
    	}
    }

    /* public/packages/svelte/components/input.svelte generated by Svelte v3.22.3 */
    const get_info_slot_changes = dirty => ({});
    const get_info_slot_context = ctx => ({});

    // (614:2) {:else}
    function create_else_block_1(ctx) {
    	let input;
    	let dispose;

    	let input_levels = [
    		{ style: /*inputStyle*/ ctx[23] },
    		{ name: /*name*/ ctx[1] },
    		{ type: /*inputType*/ ctx[36] },
    		{ placeholder: /*placeholder*/ ctx[3] },
    		{ id: /*inputId*/ ctx[4] },
    		{ size: /*size*/ ctx[5] },
    		{ accept: /*accept*/ ctx[6] },
    		{ autocomplete: /*autocomplete*/ ctx[7] },
    		{ autocorrect: /*autocorrect*/ ctx[8] },
    		{
    			autocapitalize: /*autocapitalize*/ ctx[9]
    		},
    		{ spellcheck: /*spellcheck*/ ctx[10] },
    		{ autofocus: /*autofocus*/ ctx[11] },
    		{ autosave: /*autosave*/ ctx[12] },
    		{ checked: /*checked*/ ctx[13] },
    		{ disabled: /*disabled*/ ctx[14] },
    		{ max: /*max*/ ctx[15] },
    		{ maxlength: /*maxlength*/ ctx[18] },
    		{ min: /*min*/ ctx[16] },
    		{ minlength: /*minlength*/ ctx[19] },
    		{ step: /*step*/ ctx[17] },
    		{ multiple: /*multiple*/ ctx[20] },
    		{ readOnly: /*readonly*/ ctx[21] },
    		{ required: /*required*/ ctx[22] },
    		{ pattern: /*pattern*/ ctx[24] },
    		{
    			validate: typeof /*validate*/ ctx[25] === "string" && /*validate*/ ctx[25].length
    			? /*validate*/ ctx[25]
    			: undefined
    		},
    		{
    			"data-validate": /*validate*/ ctx[25] === true || /*validate*/ ctx[25] === "" || /*validateOnBlur*/ ctx[26] === true || /*validateOnBlur*/ ctx[26] === ""
    			? true
    			: undefined
    		},
    		{
    			"data-validate-on-blur": /*validateOnBlur*/ ctx[26] === true || /*validateOnBlur*/ ctx[26] === ""
    			? true
    			: undefined
    		},
    		{ tabindex: /*tabindex*/ ctx[27] },
    		{
    			"data-error-message": /*errorMessageForce*/ ctx[31]
    			? undefined
    			: /*errorMessage*/ ctx[30]
    		},
    		{ class: /*inputClassName*/ ctx[39] },
    		{
    			value: /*type*/ ctx[0] === "datepicker" || /*type*/ ctx[0] === "colorpicker" || /*type*/ ctx[0] === "file"
    			? ""
    			: /*inputValue*/ ctx[37]
    		},
    		restProps(/*$$restProps*/ ctx[45])
    	];

    	let input_data = {};

    	for (let i = 0; i < input_levels.length; i += 1) {
    		input_data = assign(input_data, input_levels[i]);
    	}

    	return {
    		c() {
    			input = element("input");
    			set_attributes(input, input_data);
    		},
    		m(target, anchor, remount) {
    			insert(target, input, anchor);
    			/*input_binding_1*/ ctx[80](input);
    			if (remount) run_all(dispose);

    			dispose = [
    				listen(input, "focus", /*onFocus*/ ctx[42]),
    				listen(input, "blur", /*onBlur*/ ctx[43]),
    				listen(input, "input", /*onInput*/ ctx[41]),
    				listen(input, "change", /*onChange*/ ctx[44])
    			];
    		},
    		p(ctx, dirty) {
    			set_attributes(input, get_spread_update(input_levels, [
    				dirty[0] & /*inputStyle*/ 8388608 && { style: /*inputStyle*/ ctx[23] },
    				dirty[0] & /*name*/ 2 && { name: /*name*/ ctx[1] },
    				dirty[1] & /*inputType*/ 32 && { type: /*inputType*/ ctx[36] },
    				dirty[0] & /*placeholder*/ 8 && { placeholder: /*placeholder*/ ctx[3] },
    				dirty[0] & /*inputId*/ 16 && { id: /*inputId*/ ctx[4] },
    				dirty[0] & /*size*/ 32 && { size: /*size*/ ctx[5] },
    				dirty[0] & /*accept*/ 64 && { accept: /*accept*/ ctx[6] },
    				dirty[0] & /*autocomplete*/ 128 && { autocomplete: /*autocomplete*/ ctx[7] },
    				dirty[0] & /*autocorrect*/ 256 && { autocorrect: /*autocorrect*/ ctx[8] },
    				dirty[0] & /*autocapitalize*/ 512 && {
    					autocapitalize: /*autocapitalize*/ ctx[9]
    				},
    				dirty[0] & /*spellcheck*/ 1024 && { spellcheck: /*spellcheck*/ ctx[10] },
    				dirty[0] & /*autofocus*/ 2048 && { autofocus: /*autofocus*/ ctx[11] },
    				dirty[0] & /*autosave*/ 4096 && { autosave: /*autosave*/ ctx[12] },
    				dirty[0] & /*checked*/ 8192 && { checked: /*checked*/ ctx[13] },
    				dirty[0] & /*disabled*/ 16384 && { disabled: /*disabled*/ ctx[14] },
    				dirty[0] & /*max*/ 32768 && { max: /*max*/ ctx[15] },
    				dirty[0] & /*maxlength*/ 262144 && { maxlength: /*maxlength*/ ctx[18] },
    				dirty[0] & /*min*/ 65536 && { min: /*min*/ ctx[16] },
    				dirty[0] & /*minlength*/ 524288 && { minlength: /*minlength*/ ctx[19] },
    				dirty[0] & /*step*/ 131072 && { step: /*step*/ ctx[17] },
    				dirty[0] & /*multiple*/ 1048576 && { multiple: /*multiple*/ ctx[20] },
    				dirty[0] & /*readonly*/ 2097152 && { readOnly: /*readonly*/ ctx[21] },
    				dirty[0] & /*required*/ 4194304 && { required: /*required*/ ctx[22] },
    				dirty[0] & /*pattern*/ 16777216 && { pattern: /*pattern*/ ctx[24] },
    				dirty[0] & /*validate*/ 33554432 && {
    					validate: typeof /*validate*/ ctx[25] === "string" && /*validate*/ ctx[25].length
    					? /*validate*/ ctx[25]
    					: undefined
    				},
    				dirty[0] & /*validate, validateOnBlur*/ 100663296 && {
    					"data-validate": /*validate*/ ctx[25] === true || /*validate*/ ctx[25] === "" || /*validateOnBlur*/ ctx[26] === true || /*validateOnBlur*/ ctx[26] === ""
    					? true
    					: undefined
    				},
    				dirty[0] & /*validateOnBlur*/ 67108864 && {
    					"data-validate-on-blur": /*validateOnBlur*/ ctx[26] === true || /*validateOnBlur*/ ctx[26] === ""
    					? true
    					: undefined
    				},
    				dirty[0] & /*tabindex*/ 134217728 && { tabindex: /*tabindex*/ ctx[27] },
    				dirty[0] & /*errorMessage*/ 1073741824 | dirty[1] & /*errorMessageForce*/ 1 && {
    					"data-error-message": /*errorMessageForce*/ ctx[31]
    					? undefined
    					: /*errorMessage*/ ctx[30]
    				},
    				dirty[1] & /*inputClassName*/ 256 && { class: /*inputClassName*/ ctx[39] },
    				dirty[0] & /*type*/ 1 | dirty[1] & /*inputValue*/ 64 && {
    					value: /*type*/ ctx[0] === "datepicker" || /*type*/ ctx[0] === "colorpicker" || /*type*/ ctx[0] === "file"
    					? ""
    					: /*inputValue*/ ctx[37]
    				},
    				dirty[1] & /*$$restProps*/ 16384 && restProps(/*$$restProps*/ ctx[45])
    			]));
    		},
    		i: noop,
    		o: noop,
    		d(detaching) {
    			if (detaching) detach(input);
    			/*input_binding_1*/ ctx[80](null);
    			run_all(dispose);
    		}
    	};
    }

    // (602:34) 
    function create_if_block_13(ctx) {
    	let current;

    	const texteditor_spread_levels = [
    		{
    			value: typeof /*value*/ ctx[2] === "undefined"
    			? ""
    			: /*value*/ ctx[2]
    		},
    		{ resizable: /*resizable*/ ctx[28] },
    		{ placeholder: /*placeholder*/ ctx[3] },
    		{ onTextEditorFocus: /*onFocus*/ ctx[42] },
    		{ onTextEditorBlur: /*onBlur*/ ctx[43] },
    		{ onTextEditorInput: /*onInput*/ ctx[41] },
    		{ onTextEditorChange: /*onChange*/ ctx[44] },
    		/*textEditorParams*/ ctx[34],
    		restProps(/*$$restProps*/ ctx[45])
    	];

    	let texteditor_props = {};

    	for (let i = 0; i < texteditor_spread_levels.length; i += 1) {
    		texteditor_props = assign(texteditor_props, texteditor_spread_levels[i]);
    	}

    	const texteditor = new Text_editor({ props: texteditor_props });

    	return {
    		c() {
    			create_component(texteditor.$$.fragment);
    		},
    		m(target, anchor) {
    			mount_component(texteditor, target, anchor);
    			current = true;
    		},
    		p(ctx, dirty) {
    			const texteditor_changes = (dirty[0] & /*value, resizable, placeholder*/ 268435468 | dirty[1] & /*onFocus, onBlur, onInput, onChange, textEditorParams, $$restProps*/ 31752)
    			? get_spread_update(texteditor_spread_levels, [
    					dirty[0] & /*value*/ 4 && {
    						value: typeof /*value*/ ctx[2] === "undefined"
    						? ""
    						: /*value*/ ctx[2]
    					},
    					dirty[0] & /*resizable*/ 268435456 && { resizable: /*resizable*/ ctx[28] },
    					dirty[0] & /*placeholder*/ 8 && { placeholder: /*placeholder*/ ctx[3] },
    					dirty[1] & /*onFocus*/ 2048 && { onTextEditorFocus: /*onFocus*/ ctx[42] },
    					dirty[1] & /*onBlur*/ 4096 && { onTextEditorBlur: /*onBlur*/ ctx[43] },
    					dirty[1] & /*onInput*/ 1024 && { onTextEditorInput: /*onInput*/ ctx[41] },
    					dirty[1] & /*onChange*/ 8192 && { onTextEditorChange: /*onChange*/ ctx[44] },
    					dirty[1] & /*textEditorParams*/ 8 && get_spread_object(/*textEditorParams*/ ctx[34]),
    					dirty[1] & /*$$restProps*/ 16384 && get_spread_object(restProps(/*$$restProps*/ ctx[45]))
    				])
    			: {};

    			texteditor.$set(texteditor_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(texteditor.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(texteditor.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			destroy_component(texteditor, detaching);
    		}
    	};
    }

    // (589:29) 
    function create_if_block_12(ctx) {
    	let current;

    	const range_spread_levels = [
    		{ value: /*value*/ ctx[2] },
    		{ disabled: /*disabled*/ ctx[14] },
    		{ min: /*min*/ ctx[16] },
    		{ max: /*max*/ ctx[15] },
    		{ step: /*step*/ ctx[17] },
    		{ name: /*name*/ ctx[1] },
    		{ id: /*inputId*/ ctx[4] },
    		{ input: true },
    		restProps(/*$$restProps*/ ctx[45])
    	];

    	let range_props = {};

    	for (let i = 0; i < range_spread_levels.length; i += 1) {
    		range_props = assign(range_props, range_spread_levels[i]);
    	}

    	const range = new Range({ props: range_props });
    	range.$on("rangeChange", /*onChange*/ ctx[44]);

    	return {
    		c() {
    			create_component(range.$$.fragment);
    		},
    		m(target, anchor) {
    			mount_component(range, target, anchor);
    			current = true;
    		},
    		p(ctx, dirty) {
    			const range_changes = (dirty[0] & /*value, disabled, min, max, step, name, inputId*/ 245782 | dirty[1] & /*$$restProps*/ 16384)
    			? get_spread_update(range_spread_levels, [
    					dirty[0] & /*value*/ 4 && { value: /*value*/ ctx[2] },
    					dirty[0] & /*disabled*/ 16384 && { disabled: /*disabled*/ ctx[14] },
    					dirty[0] & /*min*/ 65536 && { min: /*min*/ ctx[16] },
    					dirty[0] & /*max*/ 32768 && { max: /*max*/ ctx[15] },
    					dirty[0] & /*step*/ 131072 && { step: /*step*/ ctx[17] },
    					dirty[0] & /*name*/ 2 && { name: /*name*/ ctx[1] },
    					dirty[0] & /*inputId*/ 16 && { id: /*inputId*/ ctx[4] },
    					range_spread_levels[7],
    					dirty[1] & /*$$restProps*/ 16384 && get_spread_object(restProps(/*$$restProps*/ ctx[45]))
    				])
    			: {};

    			range.$set(range_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(range.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(range.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			destroy_component(range, detaching);
    		}
    	};
    }

    // (578:30) 
    function create_if_block_11(ctx) {
    	let current;

    	const toggle_spread_levels = [
    		{ checked: /*checked*/ ctx[13] },
    		{ readonly: /*readonly*/ ctx[21] },
    		{ name: /*name*/ ctx[1] },
    		{ value: /*value*/ ctx[2] },
    		{ disabled: /*disabled*/ ctx[14] },
    		{ id: /*inputId*/ ctx[4] },
    		restProps(/*$$restProps*/ ctx[45])
    	];

    	let toggle_props = {};

    	for (let i = 0; i < toggle_spread_levels.length; i += 1) {
    		toggle_props = assign(toggle_props, toggle_spread_levels[i]);
    	}

    	const toggle = new Toggle({ props: toggle_props });
    	toggle.$on("change", /*onChange*/ ctx[44]);

    	return {
    		c() {
    			create_component(toggle.$$.fragment);
    		},
    		m(target, anchor) {
    			mount_component(toggle, target, anchor);
    			current = true;
    		},
    		p(ctx, dirty) {
    			const toggle_changes = (dirty[0] & /*checked, readonly, name, value, disabled, inputId*/ 2121750 | dirty[1] & /*$$restProps*/ 16384)
    			? get_spread_update(toggle_spread_levels, [
    					dirty[0] & /*checked*/ 8192 && { checked: /*checked*/ ctx[13] },
    					dirty[0] & /*readonly*/ 2097152 && { readonly: /*readonly*/ ctx[21] },
    					dirty[0] & /*name*/ 2 && { name: /*name*/ ctx[1] },
    					dirty[0] & /*value*/ 4 && { value: /*value*/ ctx[2] },
    					dirty[0] & /*disabled*/ 16384 && { disabled: /*disabled*/ ctx[14] },
    					dirty[0] & /*inputId*/ 16 && { id: /*inputId*/ ctx[4] },
    					dirty[1] & /*$$restProps*/ 16384 && get_spread_object(restProps(/*$$restProps*/ ctx[45]))
    				])
    			: {};

    			toggle.$set(toggle_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(toggle.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(toggle.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			destroy_component(toggle, detaching);
    		}
    	};
    }

    // (539:32) 
    function create_if_block_10(ctx) {
    	let textarea;
    	let dispose;

    	let textarea_levels = [
    		{ style: /*inputStyle*/ ctx[23] },
    		{ name: /*name*/ ctx[1] },
    		{ placeholder: /*placeholder*/ ctx[3] },
    		{ id: /*inputId*/ ctx[4] },
    		{ size: /*size*/ ctx[5] },
    		{ accept: /*accept*/ ctx[6] },
    		{ autocomplete: /*autocomplete*/ ctx[7] },
    		{ autocorrect: /*autocorrect*/ ctx[8] },
    		{
    			autocapitalize: /*autocapitalize*/ ctx[9]
    		},
    		{ spellcheck: /*spellcheck*/ ctx[10] },
    		{ autofocus: /*autofocus*/ ctx[11] },
    		{ autosave: /*autosave*/ ctx[12] },
    		{ checked: /*checked*/ ctx[13] },
    		{ disabled: /*disabled*/ ctx[14] },
    		{ max: /*max*/ ctx[15] },
    		{ maxlength: /*maxlength*/ ctx[18] },
    		{ min: /*min*/ ctx[16] },
    		{ minlength: /*minlength*/ ctx[19] },
    		{ step: /*step*/ ctx[17] },
    		{ multiple: /*multiple*/ ctx[20] },
    		{ readOnly: /*readonly*/ ctx[21] },
    		{ required: /*required*/ ctx[22] },
    		{ pattern: /*pattern*/ ctx[24] },
    		{
    			validate: typeof /*validate*/ ctx[25] === "string" && /*validate*/ ctx[25].length
    			? /*validate*/ ctx[25]
    			: undefined
    		},
    		{
    			"data-validate": /*validate*/ ctx[25] === true || /*validate*/ ctx[25] === "" || /*validateOnBlur*/ ctx[26] === true || /*validateOnBlur*/ ctx[26] === ""
    			? true
    			: undefined
    		},
    		{
    			"data-validate-on-blur": /*validateOnBlur*/ ctx[26] === true || /*validateOnBlur*/ ctx[26] === ""
    			? true
    			: undefined
    		},
    		{ tabindex: /*tabindex*/ ctx[27] },
    		{
    			"data-error-message": /*errorMessageForce*/ ctx[31]
    			? undefined
    			: /*errorMessage*/ ctx[30]
    		},
    		{ class: /*inputClassName*/ ctx[39] },
    		{ value: /*inputValue*/ ctx[37] },
    		restProps(/*$$restProps*/ ctx[45])
    	];

    	let textarea_data = {};

    	for (let i = 0; i < textarea_levels.length; i += 1) {
    		textarea_data = assign(textarea_data, textarea_levels[i]);
    	}

    	return {
    		c() {
    			textarea = element("textarea");
    			set_attributes(textarea, textarea_data);
    		},
    		m(target, anchor, remount) {
    			insert(target, textarea, anchor);
    			/*textarea_binding_1*/ ctx[79](textarea);
    			if (remount) run_all(dispose);

    			dispose = [
    				listen(textarea, "focus", /*onFocus*/ ctx[42]),
    				listen(textarea, "blur", /*onBlur*/ ctx[43]),
    				listen(textarea, "input", /*onInput*/ ctx[41]),
    				listen(textarea, "change", /*onChange*/ ctx[44])
    			];
    		},
    		p(ctx, dirty) {
    			set_attributes(textarea, get_spread_update(textarea_levels, [
    				dirty[0] & /*inputStyle*/ 8388608 && { style: /*inputStyle*/ ctx[23] },
    				dirty[0] & /*name*/ 2 && { name: /*name*/ ctx[1] },
    				dirty[0] & /*placeholder*/ 8 && { placeholder: /*placeholder*/ ctx[3] },
    				dirty[0] & /*inputId*/ 16 && { id: /*inputId*/ ctx[4] },
    				dirty[0] & /*size*/ 32 && { size: /*size*/ ctx[5] },
    				dirty[0] & /*accept*/ 64 && { accept: /*accept*/ ctx[6] },
    				dirty[0] & /*autocomplete*/ 128 && { autocomplete: /*autocomplete*/ ctx[7] },
    				dirty[0] & /*autocorrect*/ 256 && { autocorrect: /*autocorrect*/ ctx[8] },
    				dirty[0] & /*autocapitalize*/ 512 && {
    					autocapitalize: /*autocapitalize*/ ctx[9]
    				},
    				dirty[0] & /*spellcheck*/ 1024 && { spellcheck: /*spellcheck*/ ctx[10] },
    				dirty[0] & /*autofocus*/ 2048 && { autofocus: /*autofocus*/ ctx[11] },
    				dirty[0] & /*autosave*/ 4096 && { autosave: /*autosave*/ ctx[12] },
    				dirty[0] & /*checked*/ 8192 && { checked: /*checked*/ ctx[13] },
    				dirty[0] & /*disabled*/ 16384 && { disabled: /*disabled*/ ctx[14] },
    				dirty[0] & /*max*/ 32768 && { max: /*max*/ ctx[15] },
    				dirty[0] & /*maxlength*/ 262144 && { maxlength: /*maxlength*/ ctx[18] },
    				dirty[0] & /*min*/ 65536 && { min: /*min*/ ctx[16] },
    				dirty[0] & /*minlength*/ 524288 && { minlength: /*minlength*/ ctx[19] },
    				dirty[0] & /*step*/ 131072 && { step: /*step*/ ctx[17] },
    				dirty[0] & /*multiple*/ 1048576 && { multiple: /*multiple*/ ctx[20] },
    				dirty[0] & /*readonly*/ 2097152 && { readOnly: /*readonly*/ ctx[21] },
    				dirty[0] & /*required*/ 4194304 && { required: /*required*/ ctx[22] },
    				dirty[0] & /*pattern*/ 16777216 && { pattern: /*pattern*/ ctx[24] },
    				dirty[0] & /*validate*/ 33554432 && {
    					validate: typeof /*validate*/ ctx[25] === "string" && /*validate*/ ctx[25].length
    					? /*validate*/ ctx[25]
    					: undefined
    				},
    				dirty[0] & /*validate, validateOnBlur*/ 100663296 && {
    					"data-validate": /*validate*/ ctx[25] === true || /*validate*/ ctx[25] === "" || /*validateOnBlur*/ ctx[26] === true || /*validateOnBlur*/ ctx[26] === ""
    					? true
    					: undefined
    				},
    				dirty[0] & /*validateOnBlur*/ 67108864 && {
    					"data-validate-on-blur": /*validateOnBlur*/ ctx[26] === true || /*validateOnBlur*/ ctx[26] === ""
    					? true
    					: undefined
    				},
    				dirty[0] & /*tabindex*/ 134217728 && { tabindex: /*tabindex*/ ctx[27] },
    				dirty[0] & /*errorMessage*/ 1073741824 | dirty[1] & /*errorMessageForce*/ 1 && {
    					"data-error-message": /*errorMessageForce*/ ctx[31]
    					? undefined
    					: /*errorMessage*/ ctx[30]
    				},
    				dirty[1] & /*inputClassName*/ 256 && { class: /*inputClassName*/ ctx[39] },
    				dirty[1] & /*inputValue*/ 64 && { value: /*inputValue*/ ctx[37] },
    				dirty[1] & /*$$restProps*/ 16384 && restProps(/*$$restProps*/ ctx[45])
    			]));
    		},
    		i: noop,
    		o: noop,
    		d(detaching) {
    			if (detaching) detach(textarea);
    			/*textarea_binding_1*/ ctx[79](null);
    			run_all(dispose);
    		}
    	};
    }

    // (498:2) {#if type === 'select'}
    function create_if_block_9(ctx) {
    	let select;
    	let current;
    	let dispose;
    	const default_slot_template = /*$$slots*/ ctx[74].default;
    	const default_slot = create_slot(default_slot_template, ctx, /*$$scope*/ ctx[73], null);

    	let select_levels = [
    		{ style: /*inputStyle*/ ctx[23] },
    		{ name: /*name*/ ctx[1] },
    		{ placeholder: /*placeholder*/ ctx[3] },
    		{ id: /*inputId*/ ctx[4] },
    		{ size: /*size*/ ctx[5] },
    		{ accept: /*accept*/ ctx[6] },
    		{ autocomplete: /*autocomplete*/ ctx[7] },
    		{ autocorrect: /*autocorrect*/ ctx[8] },
    		{
    			autocapitalize: /*autocapitalize*/ ctx[9]
    		},
    		{ spellcheck: /*spellcheck*/ ctx[10] },
    		{ autofocus: /*autofocus*/ ctx[11] },
    		{ autosave: /*autosave*/ ctx[12] },
    		{ checked: /*checked*/ ctx[13] },
    		{ disabled: /*disabled*/ ctx[14] },
    		{ max: /*max*/ ctx[15] },
    		{ maxlength: /*maxlength*/ ctx[18] },
    		{ min: /*min*/ ctx[16] },
    		{ minlength: /*minlength*/ ctx[19] },
    		{ step: /*step*/ ctx[17] },
    		{ multiple: /*multiple*/ ctx[20] },
    		{ readonly: /*readonly*/ ctx[21] },
    		{ required: /*required*/ ctx[22] },
    		{ pattern: /*pattern*/ ctx[24] },
    		{
    			validate: typeof /*validate*/ ctx[25] === "string" && /*validate*/ ctx[25].length
    			? /*validate*/ ctx[25]
    			: undefined
    		},
    		{
    			"data-validate": /*validate*/ ctx[25] === true || /*validate*/ ctx[25] === "" || /*validateOnBlur*/ ctx[26] === true || /*validateOnBlur*/ ctx[26] === ""
    			? true
    			: undefined
    		},
    		{
    			"data-validate-on-blur": /*validateOnBlur*/ ctx[26] === true || /*validateOnBlur*/ ctx[26] === ""
    			? true
    			: undefined
    		},
    		{ tabindex: /*tabindex*/ ctx[27] },
    		{
    			"data-error-message": /*errorMessageForce*/ ctx[31]
    			? undefined
    			: /*errorMessage*/ ctx[30]
    		},
    		{ class: /*inputClassName*/ ctx[39] },
    		{ value: /*inputValue*/ ctx[37] },
    		restProps(/*$$restProps*/ ctx[45])
    	];

    	let select_data = {};

    	for (let i = 0; i < select_levels.length; i += 1) {
    		select_data = assign(select_data, select_levels[i]);
    	}

    	return {
    		c() {
    			select = element("select");
    			if (default_slot) default_slot.c();
    			set_attributes(select, select_data);
    		},
    		m(target, anchor, remount) {
    			insert(target, select, anchor);

    			if (default_slot) {
    				default_slot.m(select, null);
    			}

    			/*select_binding_1*/ ctx[78](select);
    			current = true;
    			if (remount) run_all(dispose);

    			dispose = [
    				listen(select, "focus", /*onFocus*/ ctx[42]),
    				listen(select, "blur", /*onBlur*/ ctx[43]),
    				listen(select, "input", /*onInput*/ ctx[41]),
    				listen(select, "change", /*onChange*/ ctx[44])
    			];
    		},
    		p(ctx, dirty) {
    			if (default_slot) {
    				if (default_slot.p && dirty[2] & /*$$scope*/ 2048) {
    					default_slot.p(get_slot_context(default_slot_template, ctx, /*$$scope*/ ctx[73], null), get_slot_changes(default_slot_template, /*$$scope*/ ctx[73], dirty, null));
    				}
    			}

    			set_attributes(select, get_spread_update(select_levels, [
    				dirty[0] & /*inputStyle*/ 8388608 && { style: /*inputStyle*/ ctx[23] },
    				dirty[0] & /*name*/ 2 && { name: /*name*/ ctx[1] },
    				dirty[0] & /*placeholder*/ 8 && { placeholder: /*placeholder*/ ctx[3] },
    				dirty[0] & /*inputId*/ 16 && { id: /*inputId*/ ctx[4] },
    				dirty[0] & /*size*/ 32 && { size: /*size*/ ctx[5] },
    				dirty[0] & /*accept*/ 64 && { accept: /*accept*/ ctx[6] },
    				dirty[0] & /*autocomplete*/ 128 && { autocomplete: /*autocomplete*/ ctx[7] },
    				dirty[0] & /*autocorrect*/ 256 && { autocorrect: /*autocorrect*/ ctx[8] },
    				dirty[0] & /*autocapitalize*/ 512 && {
    					autocapitalize: /*autocapitalize*/ ctx[9]
    				},
    				dirty[0] & /*spellcheck*/ 1024 && { spellcheck: /*spellcheck*/ ctx[10] },
    				dirty[0] & /*autofocus*/ 2048 && { autofocus: /*autofocus*/ ctx[11] },
    				dirty[0] & /*autosave*/ 4096 && { autosave: /*autosave*/ ctx[12] },
    				dirty[0] & /*checked*/ 8192 && { checked: /*checked*/ ctx[13] },
    				dirty[0] & /*disabled*/ 16384 && { disabled: /*disabled*/ ctx[14] },
    				dirty[0] & /*max*/ 32768 && { max: /*max*/ ctx[15] },
    				dirty[0] & /*maxlength*/ 262144 && { maxlength: /*maxlength*/ ctx[18] },
    				dirty[0] & /*min*/ 65536 && { min: /*min*/ ctx[16] },
    				dirty[0] & /*minlength*/ 524288 && { minlength: /*minlength*/ ctx[19] },
    				dirty[0] & /*step*/ 131072 && { step: /*step*/ ctx[17] },
    				dirty[0] & /*multiple*/ 1048576 && { multiple: /*multiple*/ ctx[20] },
    				dirty[0] & /*readonly*/ 2097152 && { readonly: /*readonly*/ ctx[21] },
    				dirty[0] & /*required*/ 4194304 && { required: /*required*/ ctx[22] },
    				dirty[0] & /*pattern*/ 16777216 && { pattern: /*pattern*/ ctx[24] },
    				dirty[0] & /*validate*/ 33554432 && {
    					validate: typeof /*validate*/ ctx[25] === "string" && /*validate*/ ctx[25].length
    					? /*validate*/ ctx[25]
    					: undefined
    				},
    				dirty[0] & /*validate, validateOnBlur*/ 100663296 && {
    					"data-validate": /*validate*/ ctx[25] === true || /*validate*/ ctx[25] === "" || /*validateOnBlur*/ ctx[26] === true || /*validateOnBlur*/ ctx[26] === ""
    					? true
    					: undefined
    				},
    				dirty[0] & /*validateOnBlur*/ 67108864 && {
    					"data-validate-on-blur": /*validateOnBlur*/ ctx[26] === true || /*validateOnBlur*/ ctx[26] === ""
    					? true
    					: undefined
    				},
    				dirty[0] & /*tabindex*/ 134217728 && { tabindex: /*tabindex*/ ctx[27] },
    				dirty[0] & /*errorMessage*/ 1073741824 | dirty[1] & /*errorMessageForce*/ 1 && {
    					"data-error-message": /*errorMessageForce*/ ctx[31]
    					? undefined
    					: /*errorMessage*/ ctx[30]
    				},
    				dirty[1] & /*inputClassName*/ 256 && { class: /*inputClassName*/ ctx[39] },
    				dirty[1] & /*inputValue*/ 64 && { value: /*inputValue*/ ctx[37] },
    				dirty[1] & /*$$restProps*/ 16384 && restProps(/*$$restProps*/ ctx[45])
    			]));
    		},
    		i(local) {
    			if (current) return;
    			transition_in(default_slot, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(default_slot, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(select);
    			if (default_slot) default_slot.d(detaching);
    			/*select_binding_1*/ ctx[78](null);
    			run_all(dispose);
    		}
    	};
    }

    // (331:0) {#if wrap}
    function create_if_block$1(ctx) {
    	let div;
    	let current_block_type_index;
    	let if_block0;
    	let t0;
    	let t1;
    	let t2;
    	let current;

    	const if_block_creators = [
    		create_if_block_4,
    		create_if_block_5,
    		create_if_block_6,
    		create_if_block_7,
    		create_if_block_8,
    		create_else_block
    	];

    	const if_blocks = [];

    	function select_block_type_1(ctx, dirty) {
    		if (/*type*/ ctx[0] === "select") return 0;
    		if (/*type*/ ctx[0] === "textarea") return 1;
    		if (/*type*/ ctx[0] === "toggle") return 2;
    		if (/*type*/ ctx[0] === "range") return 3;
    		if (/*type*/ ctx[0] === "texteditor") return 4;
    		return 5;
    	}

    	current_block_type_index = select_block_type_1(ctx);
    	if_block0 = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);
    	let if_block1 = /*errorMessage*/ ctx[30] && /*errorMessageForce*/ ctx[31] && create_if_block_3(ctx);
    	let if_block2 = /*clearButton*/ ctx[29] && create_if_block_2();
    	let if_block3 = (/*info*/ ctx[32] || /*hasInfoSlots*/ ctx[40]) && create_if_block_1(ctx);
    	let div_levels = [{ class: /*wrapClasses*/ ctx[38] }, restProps(/*$$restProps*/ ctx[45])];
    	let div_data = {};

    	for (let i = 0; i < div_levels.length; i += 1) {
    		div_data = assign(div_data, div_levels[i]);
    	}

    	return {
    		c() {
    			div = element("div");
    			if_block0.c();
    			t0 = space();
    			if (if_block1) if_block1.c();
    			t1 = space();
    			if (if_block2) if_block2.c();
    			t2 = space();
    			if (if_block3) if_block3.c();
    			set_attributes(div, div_data);
    		},
    		m(target, anchor) {
    			insert(target, div, anchor);
    			if_blocks[current_block_type_index].m(div, null);
    			append(div, t0);
    			if (if_block1) if_block1.m(div, null);
    			append(div, t1);
    			if (if_block2) if_block2.m(div, null);
    			append(div, t2);
    			if (if_block3) if_block3.m(div, null);
    			current = true;
    		},
    		p(ctx, dirty) {
    			let previous_block_index = current_block_type_index;
    			current_block_type_index = select_block_type_1(ctx);

    			if (current_block_type_index === previous_block_index) {
    				if_blocks[current_block_type_index].p(ctx, dirty);
    			} else {
    				group_outros();

    				transition_out(if_blocks[previous_block_index], 1, 1, () => {
    					if_blocks[previous_block_index] = null;
    				});

    				check_outros();
    				if_block0 = if_blocks[current_block_type_index];

    				if (!if_block0) {
    					if_block0 = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);
    					if_block0.c();
    				}

    				transition_in(if_block0, 1);
    				if_block0.m(div, t0);
    			}

    			if (/*errorMessage*/ ctx[30] && /*errorMessageForce*/ ctx[31]) {
    				if (if_block1) {
    					if_block1.p(ctx, dirty);
    				} else {
    					if_block1 = create_if_block_3(ctx);
    					if_block1.c();
    					if_block1.m(div, t1);
    				}
    			} else if (if_block1) {
    				if_block1.d(1);
    				if_block1 = null;
    			}

    			if (/*clearButton*/ ctx[29]) {
    				if (if_block2) ; else {
    					if_block2 = create_if_block_2();
    					if_block2.c();
    					if_block2.m(div, t2);
    				}
    			} else if (if_block2) {
    				if_block2.d(1);
    				if_block2 = null;
    			}

    			if (/*info*/ ctx[32] || /*hasInfoSlots*/ ctx[40]) {
    				if (if_block3) {
    					if_block3.p(ctx, dirty);

    					if (dirty[1] & /*info, hasInfoSlots*/ 514) {
    						transition_in(if_block3, 1);
    					}
    				} else {
    					if_block3 = create_if_block_1(ctx);
    					if_block3.c();
    					transition_in(if_block3, 1);
    					if_block3.m(div, null);
    				}
    			} else if (if_block3) {
    				group_outros();

    				transition_out(if_block3, 1, 1, () => {
    					if_block3 = null;
    				});

    				check_outros();
    			}

    			set_attributes(div, get_spread_update(div_levels, [
    				dirty[1] & /*wrapClasses*/ 128 && { class: /*wrapClasses*/ ctx[38] },
    				dirty[1] & /*$$restProps*/ 16384 && restProps(/*$$restProps*/ ctx[45])
    			]));
    		},
    		i(local) {
    			if (current) return;
    			transition_in(if_block0);
    			transition_in(if_block3);
    			current = true;
    		},
    		o(local) {
    			transition_out(if_block0);
    			transition_out(if_block3);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(div);
    			if_blocks[current_block_type_index].d();
    			if (if_block1) if_block1.d();
    			if (if_block2) if_block2.d();
    			if (if_block3) if_block3.d();
    		}
    	};
    }

    // (444:4) {:else}
    function create_else_block(ctx) {
    	let input;
    	let input_validate_value;
    	let input_data_validate_value;
    	let input_data_validate_on_blur_value;
    	let input_data_error_message_value;
    	let input_value_value;
    	let dispose;

    	return {
    		c() {
    			input = element("input");
    			attr(input, "style", /*inputStyle*/ ctx[23]);
    			attr(input, "name", /*name*/ ctx[1]);
    			attr(input, "type", /*inputType*/ ctx[36]);
    			attr(input, "placeholder", /*placeholder*/ ctx[3]);
    			attr(input, "id", /*inputId*/ ctx[4]);
    			attr(input, "size", /*size*/ ctx[5]);
    			attr(input, "accept", /*accept*/ ctx[6]);
    			attr(input, "autocomplete", /*autocomplete*/ ctx[7]);
    			attr(input, "autocorrect", /*autocorrect*/ ctx[8]);
    			attr(input, "autocapitalize", /*autocapitalize*/ ctx[9]);
    			attr(input, "spellcheck", /*spellcheck*/ ctx[10]);
    			input.autofocus = /*autofocus*/ ctx[11];
    			attr(input, "autosave", /*autosave*/ ctx[12]);
    			input.checked = /*checked*/ ctx[13];
    			input.disabled = /*disabled*/ ctx[14];
    			attr(input, "max", /*max*/ ctx[15]);
    			attr(input, "maxlength", /*maxlength*/ ctx[18]);
    			attr(input, "min", /*min*/ ctx[16]);
    			attr(input, "minlength", /*minlength*/ ctx[19]);
    			attr(input, "step", /*step*/ ctx[17]);
    			input.multiple = /*multiple*/ ctx[20];
    			input.readOnly = /*readonly*/ ctx[21];
    			input.required = /*required*/ ctx[22];
    			attr(input, "pattern", /*pattern*/ ctx[24]);

    			attr(input, "validate", input_validate_value = typeof /*validate*/ ctx[25] === "string" && /*validate*/ ctx[25].length
    			? /*validate*/ ctx[25]
    			: undefined);

    			attr(input, "data-validate", input_data_validate_value = /*validate*/ ctx[25] === true || /*validate*/ ctx[25] === "" || /*validateOnBlur*/ ctx[26] === true || /*validateOnBlur*/ ctx[26] === ""
    			? true
    			: undefined);

    			attr(input, "data-validate-on-blur", input_data_validate_on_blur_value = /*validateOnBlur*/ ctx[26] === true || /*validateOnBlur*/ ctx[26] === ""
    			? true
    			: undefined);

    			attr(input, "tabindex", /*tabindex*/ ctx[27]);

    			attr(input, "data-error-message", input_data_error_message_value = /*errorMessageForce*/ ctx[31]
    			? undefined
    			: /*errorMessage*/ ctx[30]);

    			attr(input, "class", /*inputClassName*/ ctx[39]);

    			input.value = input_value_value = /*type*/ ctx[0] === "datepicker" || /*type*/ ctx[0] === "colorpicker" || /*type*/ ctx[0] === "file"
    			? ""
    			: /*inputValue*/ ctx[37];
    		},
    		m(target, anchor, remount) {
    			insert(target, input, anchor);
    			/*input_binding*/ ctx[77](input);
    			if (remount) run_all(dispose);

    			dispose = [
    				listen(input, "focus", /*onFocus*/ ctx[42]),
    				listen(input, "blur", /*onBlur*/ ctx[43]),
    				listen(input, "input", /*onInput*/ ctx[41]),
    				listen(input, "change", /*onChange*/ ctx[44])
    			];
    		},
    		p(ctx, dirty) {
    			if (dirty[0] & /*inputStyle*/ 8388608) {
    				attr(input, "style", /*inputStyle*/ ctx[23]);
    			}

    			if (dirty[0] & /*name*/ 2) {
    				attr(input, "name", /*name*/ ctx[1]);
    			}

    			if (dirty[1] & /*inputType*/ 32) {
    				attr(input, "type", /*inputType*/ ctx[36]);
    			}

    			if (dirty[0] & /*placeholder*/ 8) {
    				attr(input, "placeholder", /*placeholder*/ ctx[3]);
    			}

    			if (dirty[0] & /*inputId*/ 16) {
    				attr(input, "id", /*inputId*/ ctx[4]);
    			}

    			if (dirty[0] & /*size*/ 32) {
    				attr(input, "size", /*size*/ ctx[5]);
    			}

    			if (dirty[0] & /*accept*/ 64) {
    				attr(input, "accept", /*accept*/ ctx[6]);
    			}

    			if (dirty[0] & /*autocomplete*/ 128) {
    				attr(input, "autocomplete", /*autocomplete*/ ctx[7]);
    			}

    			if (dirty[0] & /*autocorrect*/ 256) {
    				attr(input, "autocorrect", /*autocorrect*/ ctx[8]);
    			}

    			if (dirty[0] & /*autocapitalize*/ 512) {
    				attr(input, "autocapitalize", /*autocapitalize*/ ctx[9]);
    			}

    			if (dirty[0] & /*spellcheck*/ 1024) {
    				attr(input, "spellcheck", /*spellcheck*/ ctx[10]);
    			}

    			if (dirty[0] & /*autofocus*/ 2048) {
    				input.autofocus = /*autofocus*/ ctx[11];
    			}

    			if (dirty[0] & /*autosave*/ 4096) {
    				attr(input, "autosave", /*autosave*/ ctx[12]);
    			}

    			if (dirty[0] & /*checked*/ 8192) {
    				input.checked = /*checked*/ ctx[13];
    			}

    			if (dirty[0] & /*disabled*/ 16384) {
    				input.disabled = /*disabled*/ ctx[14];
    			}

    			if (dirty[0] & /*max*/ 32768) {
    				attr(input, "max", /*max*/ ctx[15]);
    			}

    			if (dirty[0] & /*maxlength*/ 262144) {
    				attr(input, "maxlength", /*maxlength*/ ctx[18]);
    			}

    			if (dirty[0] & /*min*/ 65536) {
    				attr(input, "min", /*min*/ ctx[16]);
    			}

    			if (dirty[0] & /*minlength*/ 524288) {
    				attr(input, "minlength", /*minlength*/ ctx[19]);
    			}

    			if (dirty[0] & /*step*/ 131072) {
    				attr(input, "step", /*step*/ ctx[17]);
    			}

    			if (dirty[0] & /*multiple*/ 1048576) {
    				input.multiple = /*multiple*/ ctx[20];
    			}

    			if (dirty[0] & /*readonly*/ 2097152) {
    				input.readOnly = /*readonly*/ ctx[21];
    			}

    			if (dirty[0] & /*required*/ 4194304) {
    				input.required = /*required*/ ctx[22];
    			}

    			if (dirty[0] & /*pattern*/ 16777216) {
    				attr(input, "pattern", /*pattern*/ ctx[24]);
    			}

    			if (dirty[0] & /*validate*/ 33554432 && input_validate_value !== (input_validate_value = typeof /*validate*/ ctx[25] === "string" && /*validate*/ ctx[25].length
    			? /*validate*/ ctx[25]
    			: undefined)) {
    				attr(input, "validate", input_validate_value);
    			}

    			if (dirty[0] & /*validate, validateOnBlur*/ 100663296 && input_data_validate_value !== (input_data_validate_value = /*validate*/ ctx[25] === true || /*validate*/ ctx[25] === "" || /*validateOnBlur*/ ctx[26] === true || /*validateOnBlur*/ ctx[26] === ""
    			? true
    			: undefined)) {
    				attr(input, "data-validate", input_data_validate_value);
    			}

    			if (dirty[0] & /*validateOnBlur*/ 67108864 && input_data_validate_on_blur_value !== (input_data_validate_on_blur_value = /*validateOnBlur*/ ctx[26] === true || /*validateOnBlur*/ ctx[26] === ""
    			? true
    			: undefined)) {
    				attr(input, "data-validate-on-blur", input_data_validate_on_blur_value);
    			}

    			if (dirty[0] & /*tabindex*/ 134217728) {
    				attr(input, "tabindex", /*tabindex*/ ctx[27]);
    			}

    			if (dirty[0] & /*errorMessage*/ 1073741824 | dirty[1] & /*errorMessageForce*/ 1 && input_data_error_message_value !== (input_data_error_message_value = /*errorMessageForce*/ ctx[31]
    			? undefined
    			: /*errorMessage*/ ctx[30])) {
    				attr(input, "data-error-message", input_data_error_message_value);
    			}

    			if (dirty[1] & /*inputClassName*/ 256) {
    				attr(input, "class", /*inputClassName*/ ctx[39]);
    			}

    			if (dirty[0] & /*type*/ 1 | dirty[1] & /*inputValue*/ 64 && input_value_value !== (input_value_value = /*type*/ ctx[0] === "datepicker" || /*type*/ ctx[0] === "colorpicker" || /*type*/ ctx[0] === "file"
    			? ""
    			: /*inputValue*/ ctx[37]) && input.value !== input_value_value) {
    				input.value = input_value_value;
    			}
    		},
    		i: noop,
    		o: noop,
    		d(detaching) {
    			if (detaching) detach(input);
    			/*input_binding*/ ctx[77](null);
    			run_all(dispose);
    		}
    	};
    }

    // (433:36) 
    function create_if_block_8(ctx) {
    	let current;

    	const texteditor_spread_levels = [
    		{
    			value: typeof /*value*/ ctx[2] === "undefined"
    			? ""
    			: /*value*/ ctx[2]
    		},
    		{ resizable: /*resizable*/ ctx[28] },
    		{ placeholder: /*placeholder*/ ctx[3] },
    		{ onTextEditorFocus: /*onFocus*/ ctx[42] },
    		{ onTextEditorBlur: /*onBlur*/ ctx[43] },
    		{ onTextEditorInput: /*onInput*/ ctx[41] },
    		{ onTextEditorChange: /*onChange*/ ctx[44] },
    		/*textEditorParams*/ ctx[34]
    	];

    	let texteditor_props = {};

    	for (let i = 0; i < texteditor_spread_levels.length; i += 1) {
    		texteditor_props = assign(texteditor_props, texteditor_spread_levels[i]);
    	}

    	const texteditor = new Text_editor({ props: texteditor_props });

    	return {
    		c() {
    			create_component(texteditor.$$.fragment);
    		},
    		m(target, anchor) {
    			mount_component(texteditor, target, anchor);
    			current = true;
    		},
    		p(ctx, dirty) {
    			const texteditor_changes = (dirty[0] & /*value, resizable, placeholder*/ 268435468 | dirty[1] & /*onFocus, onBlur, onInput, onChange, textEditorParams*/ 15368)
    			? get_spread_update(texteditor_spread_levels, [
    					dirty[0] & /*value*/ 4 && {
    						value: typeof /*value*/ ctx[2] === "undefined"
    						? ""
    						: /*value*/ ctx[2]
    					},
    					dirty[0] & /*resizable*/ 268435456 && { resizable: /*resizable*/ ctx[28] },
    					dirty[0] & /*placeholder*/ 8 && { placeholder: /*placeholder*/ ctx[3] },
    					dirty[1] & /*onFocus*/ 2048 && { onTextEditorFocus: /*onFocus*/ ctx[42] },
    					dirty[1] & /*onBlur*/ 4096 && { onTextEditorBlur: /*onBlur*/ ctx[43] },
    					dirty[1] & /*onInput*/ 1024 && { onTextEditorInput: /*onInput*/ ctx[41] },
    					dirty[1] & /*onChange*/ 8192 && { onTextEditorChange: /*onChange*/ ctx[44] },
    					dirty[1] & /*textEditorParams*/ 8 && get_spread_object(/*textEditorParams*/ ctx[34])
    				])
    			: {};

    			texteditor.$set(texteditor_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(texteditor.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(texteditor.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			destroy_component(texteditor, detaching);
    		}
    	};
    }

    // (421:31) 
    function create_if_block_7(ctx) {
    	let current;

    	const range = new Range({
    			props: {
    				value: /*value*/ ctx[2],
    				disabled: /*disabled*/ ctx[14],
    				min: /*min*/ ctx[16],
    				max: /*max*/ ctx[15],
    				step: /*step*/ ctx[17],
    				name: /*name*/ ctx[1],
    				id: /*inputId*/ ctx[4],
    				input: true
    			}
    		});

    	range.$on("rangeChange", /*onChange*/ ctx[44]);

    	return {
    		c() {
    			create_component(range.$$.fragment);
    		},
    		m(target, anchor) {
    			mount_component(range, target, anchor);
    			current = true;
    		},
    		p(ctx, dirty) {
    			const range_changes = {};
    			if (dirty[0] & /*value*/ 4) range_changes.value = /*value*/ ctx[2];
    			if (dirty[0] & /*disabled*/ 16384) range_changes.disabled = /*disabled*/ ctx[14];
    			if (dirty[0] & /*min*/ 65536) range_changes.min = /*min*/ ctx[16];
    			if (dirty[0] & /*max*/ 32768) range_changes.max = /*max*/ ctx[15];
    			if (dirty[0] & /*step*/ 131072) range_changes.step = /*step*/ ctx[17];
    			if (dirty[0] & /*name*/ 2) range_changes.name = /*name*/ ctx[1];
    			if (dirty[0] & /*inputId*/ 16) range_changes.id = /*inputId*/ ctx[4];
    			range.$set(range_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(range.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(range.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			destroy_component(range, detaching);
    		}
    	};
    }

    // (411:32) 
    function create_if_block_6(ctx) {
    	let current;

    	const toggle = new Toggle({
    			props: {
    				checked: /*checked*/ ctx[13],
    				readonly: /*readonly*/ ctx[21],
    				name: /*name*/ ctx[1],
    				value: /*value*/ ctx[2],
    				disabled: /*disabled*/ ctx[14],
    				id: /*inputId*/ ctx[4]
    			}
    		});

    	toggle.$on("change", /*onChange*/ ctx[44]);

    	return {
    		c() {
    			create_component(toggle.$$.fragment);
    		},
    		m(target, anchor) {
    			mount_component(toggle, target, anchor);
    			current = true;
    		},
    		p(ctx, dirty) {
    			const toggle_changes = {};
    			if (dirty[0] & /*checked*/ 8192) toggle_changes.checked = /*checked*/ ctx[13];
    			if (dirty[0] & /*readonly*/ 2097152) toggle_changes.readonly = /*readonly*/ ctx[21];
    			if (dirty[0] & /*name*/ 2) toggle_changes.name = /*name*/ ctx[1];
    			if (dirty[0] & /*value*/ 4) toggle_changes.value = /*value*/ ctx[2];
    			if (dirty[0] & /*disabled*/ 16384) toggle_changes.disabled = /*disabled*/ ctx[14];
    			if (dirty[0] & /*inputId*/ 16) toggle_changes.id = /*inputId*/ ctx[4];
    			toggle.$set(toggle_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(toggle.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(toggle.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			destroy_component(toggle, detaching);
    		}
    	};
    }

    // (373:34) 
    function create_if_block_5(ctx) {
    	let textarea;
    	let textarea_validate_value;
    	let textarea_data_validate_value;
    	let textarea_data_validate_on_blur_value;
    	let textarea_data_error_message_value;
    	let dispose;

    	return {
    		c() {
    			textarea = element("textarea");
    			attr(textarea, "style", /*inputStyle*/ ctx[23]);
    			attr(textarea, "name", /*name*/ ctx[1]);
    			attr(textarea, "placeholder", /*placeholder*/ ctx[3]);
    			attr(textarea, "id", /*inputId*/ ctx[4]);
    			attr(textarea, "size", /*size*/ ctx[5]);
    			attr(textarea, "accept", /*accept*/ ctx[6]);
    			attr(textarea, "autocomplete", /*autocomplete*/ ctx[7]);
    			attr(textarea, "autocorrect", /*autocorrect*/ ctx[8]);
    			attr(textarea, "autocapitalize", /*autocapitalize*/ ctx[9]);
    			attr(textarea, "spellcheck", /*spellcheck*/ ctx[10]);
    			textarea.autofocus = /*autofocus*/ ctx[11];
    			attr(textarea, "autosave", /*autosave*/ ctx[12]);
    			attr(textarea, "checked", /*checked*/ ctx[13]);
    			textarea.disabled = /*disabled*/ ctx[14];
    			attr(textarea, "max", /*max*/ ctx[15]);
    			attr(textarea, "maxlength", /*maxlength*/ ctx[18]);
    			attr(textarea, "min", /*min*/ ctx[16]);
    			attr(textarea, "minlength", /*minlength*/ ctx[19]);
    			attr(textarea, "step", /*step*/ ctx[17]);
    			attr(textarea, "multiple", /*multiple*/ ctx[20]);
    			textarea.readOnly = /*readonly*/ ctx[21];
    			textarea.required = /*required*/ ctx[22];
    			attr(textarea, "pattern", /*pattern*/ ctx[24]);

    			attr(textarea, "validate", textarea_validate_value = typeof /*validate*/ ctx[25] === "string" && /*validate*/ ctx[25].length
    			? /*validate*/ ctx[25]
    			: undefined);

    			attr(textarea, "data-validate", textarea_data_validate_value = /*validate*/ ctx[25] === true || /*validate*/ ctx[25] === "" || /*validateOnBlur*/ ctx[26] === true || /*validateOnBlur*/ ctx[26] === ""
    			? true
    			: undefined);

    			attr(textarea, "data-validate-on-blur", textarea_data_validate_on_blur_value = /*validateOnBlur*/ ctx[26] === true || /*validateOnBlur*/ ctx[26] === ""
    			? true
    			: undefined);

    			attr(textarea, "tabindex", /*tabindex*/ ctx[27]);

    			attr(textarea, "data-error-message", textarea_data_error_message_value = /*errorMessageForce*/ ctx[31]
    			? undefined
    			: /*errorMessage*/ ctx[30]);

    			attr(textarea, "class", /*inputClassName*/ ctx[39]);
    			textarea.value = /*inputValue*/ ctx[37];
    		},
    		m(target, anchor, remount) {
    			insert(target, textarea, anchor);
    			/*textarea_binding*/ ctx[76](textarea);
    			if (remount) run_all(dispose);

    			dispose = [
    				listen(textarea, "focus", /*onFocus*/ ctx[42]),
    				listen(textarea, "blur", /*onBlur*/ ctx[43]),
    				listen(textarea, "input", /*onInput*/ ctx[41]),
    				listen(textarea, "change", /*onChange*/ ctx[44])
    			];
    		},
    		p(ctx, dirty) {
    			if (dirty[0] & /*inputStyle*/ 8388608) {
    				attr(textarea, "style", /*inputStyle*/ ctx[23]);
    			}

    			if (dirty[0] & /*name*/ 2) {
    				attr(textarea, "name", /*name*/ ctx[1]);
    			}

    			if (dirty[0] & /*placeholder*/ 8) {
    				attr(textarea, "placeholder", /*placeholder*/ ctx[3]);
    			}

    			if (dirty[0] & /*inputId*/ 16) {
    				attr(textarea, "id", /*inputId*/ ctx[4]);
    			}

    			if (dirty[0] & /*size*/ 32) {
    				attr(textarea, "size", /*size*/ ctx[5]);
    			}

    			if (dirty[0] & /*accept*/ 64) {
    				attr(textarea, "accept", /*accept*/ ctx[6]);
    			}

    			if (dirty[0] & /*autocomplete*/ 128) {
    				attr(textarea, "autocomplete", /*autocomplete*/ ctx[7]);
    			}

    			if (dirty[0] & /*autocorrect*/ 256) {
    				attr(textarea, "autocorrect", /*autocorrect*/ ctx[8]);
    			}

    			if (dirty[0] & /*autocapitalize*/ 512) {
    				attr(textarea, "autocapitalize", /*autocapitalize*/ ctx[9]);
    			}

    			if (dirty[0] & /*spellcheck*/ 1024) {
    				attr(textarea, "spellcheck", /*spellcheck*/ ctx[10]);
    			}

    			if (dirty[0] & /*autofocus*/ 2048) {
    				textarea.autofocus = /*autofocus*/ ctx[11];
    			}

    			if (dirty[0] & /*autosave*/ 4096) {
    				attr(textarea, "autosave", /*autosave*/ ctx[12]);
    			}

    			if (dirty[0] & /*checked*/ 8192) {
    				attr(textarea, "checked", /*checked*/ ctx[13]);
    			}

    			if (dirty[0] & /*disabled*/ 16384) {
    				textarea.disabled = /*disabled*/ ctx[14];
    			}

    			if (dirty[0] & /*max*/ 32768) {
    				attr(textarea, "max", /*max*/ ctx[15]);
    			}

    			if (dirty[0] & /*maxlength*/ 262144) {
    				attr(textarea, "maxlength", /*maxlength*/ ctx[18]);
    			}

    			if (dirty[0] & /*min*/ 65536) {
    				attr(textarea, "min", /*min*/ ctx[16]);
    			}

    			if (dirty[0] & /*minlength*/ 524288) {
    				attr(textarea, "minlength", /*minlength*/ ctx[19]);
    			}

    			if (dirty[0] & /*step*/ 131072) {
    				attr(textarea, "step", /*step*/ ctx[17]);
    			}

    			if (dirty[0] & /*multiple*/ 1048576) {
    				attr(textarea, "multiple", /*multiple*/ ctx[20]);
    			}

    			if (dirty[0] & /*readonly*/ 2097152) {
    				textarea.readOnly = /*readonly*/ ctx[21];
    			}

    			if (dirty[0] & /*required*/ 4194304) {
    				textarea.required = /*required*/ ctx[22];
    			}

    			if (dirty[0] & /*pattern*/ 16777216) {
    				attr(textarea, "pattern", /*pattern*/ ctx[24]);
    			}

    			if (dirty[0] & /*validate*/ 33554432 && textarea_validate_value !== (textarea_validate_value = typeof /*validate*/ ctx[25] === "string" && /*validate*/ ctx[25].length
    			? /*validate*/ ctx[25]
    			: undefined)) {
    				attr(textarea, "validate", textarea_validate_value);
    			}

    			if (dirty[0] & /*validate, validateOnBlur*/ 100663296 && textarea_data_validate_value !== (textarea_data_validate_value = /*validate*/ ctx[25] === true || /*validate*/ ctx[25] === "" || /*validateOnBlur*/ ctx[26] === true || /*validateOnBlur*/ ctx[26] === ""
    			? true
    			: undefined)) {
    				attr(textarea, "data-validate", textarea_data_validate_value);
    			}

    			if (dirty[0] & /*validateOnBlur*/ 67108864 && textarea_data_validate_on_blur_value !== (textarea_data_validate_on_blur_value = /*validateOnBlur*/ ctx[26] === true || /*validateOnBlur*/ ctx[26] === ""
    			? true
    			: undefined)) {
    				attr(textarea, "data-validate-on-blur", textarea_data_validate_on_blur_value);
    			}

    			if (dirty[0] & /*tabindex*/ 134217728) {
    				attr(textarea, "tabindex", /*tabindex*/ ctx[27]);
    			}

    			if (dirty[0] & /*errorMessage*/ 1073741824 | dirty[1] & /*errorMessageForce*/ 1 && textarea_data_error_message_value !== (textarea_data_error_message_value = /*errorMessageForce*/ ctx[31]
    			? undefined
    			: /*errorMessage*/ ctx[30])) {
    				attr(textarea, "data-error-message", textarea_data_error_message_value);
    			}

    			if (dirty[1] & /*inputClassName*/ 256) {
    				attr(textarea, "class", /*inputClassName*/ ctx[39]);
    			}

    			if (dirty[1] & /*inputValue*/ 64) {
    				textarea.value = /*inputValue*/ ctx[37];
    			}
    		},
    		i: noop,
    		o: noop,
    		d(detaching) {
    			if (detaching) detach(textarea);
    			/*textarea_binding*/ ctx[76](null);
    			run_all(dispose);
    		}
    	};
    }

    // (333:4) {#if type === 'select'}
    function create_if_block_4(ctx) {
    	let select;
    	let select_validate_value;
    	let select_data_validate_value;
    	let select_data_validate_on_blur_value;
    	let select_data_error_message_value;
    	let select_value_value;
    	let current;
    	let dispose;
    	const default_slot_template = /*$$slots*/ ctx[74].default;
    	const default_slot = create_slot(default_slot_template, ctx, /*$$scope*/ ctx[73], null);

    	return {
    		c() {
    			select = element("select");
    			if (default_slot) default_slot.c();
    			attr(select, "style", /*inputStyle*/ ctx[23]);
    			attr(select, "name", /*name*/ ctx[1]);
    			attr(select, "placeholder", /*placeholder*/ ctx[3]);
    			attr(select, "id", /*inputId*/ ctx[4]);
    			attr(select, "size", /*size*/ ctx[5]);
    			attr(select, "accept", /*accept*/ ctx[6]);
    			attr(select, "autocomplete", /*autocomplete*/ ctx[7]);
    			attr(select, "autocorrect", /*autocorrect*/ ctx[8]);
    			attr(select, "autocapitalize", /*autocapitalize*/ ctx[9]);
    			attr(select, "spellcheck", /*spellcheck*/ ctx[10]);
    			select.autofocus = /*autofocus*/ ctx[11];
    			attr(select, "autosave", /*autosave*/ ctx[12]);
    			attr(select, "checked", /*checked*/ ctx[13]);
    			select.disabled = /*disabled*/ ctx[14];
    			attr(select, "max", /*max*/ ctx[15]);
    			attr(select, "maxlength", /*maxlength*/ ctx[18]);
    			attr(select, "min", /*min*/ ctx[16]);
    			attr(select, "minlength", /*minlength*/ ctx[19]);
    			attr(select, "step", /*step*/ ctx[17]);
    			select.multiple = /*multiple*/ ctx[20];
    			attr(select, "readonly", /*readonly*/ ctx[21]);
    			select.required = /*required*/ ctx[22];
    			attr(select, "pattern", /*pattern*/ ctx[24]);

    			attr(select, "validate", select_validate_value = typeof /*validate*/ ctx[25] === "string" && /*validate*/ ctx[25].length
    			? /*validate*/ ctx[25]
    			: undefined);

    			attr(select, "data-validate", select_data_validate_value = /*validate*/ ctx[25] === true || /*validate*/ ctx[25] === "" || /*validateOnBlur*/ ctx[26] === true || /*validateOnBlur*/ ctx[26] === ""
    			? true
    			: undefined);

    			attr(select, "data-validate-on-blur", select_data_validate_on_blur_value = /*validateOnBlur*/ ctx[26] === true || /*validateOnBlur*/ ctx[26] === ""
    			? true
    			: undefined);

    			attr(select, "tabindex", /*tabindex*/ ctx[27]);

    			attr(select, "data-error-message", select_data_error_message_value = /*errorMessageForce*/ ctx[31]
    			? undefined
    			: /*errorMessage*/ ctx[30]);

    			attr(select, "class", /*inputClassName*/ ctx[39]);
    		},
    		m(target, anchor, remount) {
    			insert(target, select, anchor);

    			if (default_slot) {
    				default_slot.m(select, null);
    			}

    			select_value_value = /*inputValue*/ ctx[37];

    			for (var i = 0; i < select.options.length; i += 1) {
    				var option = select.options[i];

    				if (option.__value === select_value_value) {
    					option.selected = true;
    					break;
    				}
    			}

    			/*select_binding*/ ctx[75](select);
    			current = true;
    			if (remount) run_all(dispose);

    			dispose = [
    				listen(select, "focus", /*onFocus*/ ctx[42]),
    				listen(select, "blur", /*onBlur*/ ctx[43]),
    				listen(select, "input", /*onInput*/ ctx[41]),
    				listen(select, "change", /*onChange*/ ctx[44])
    			];
    		},
    		p(ctx, dirty) {
    			if (default_slot) {
    				if (default_slot.p && dirty[2] & /*$$scope*/ 2048) {
    					default_slot.p(get_slot_context(default_slot_template, ctx, /*$$scope*/ ctx[73], null), get_slot_changes(default_slot_template, /*$$scope*/ ctx[73], dirty, null));
    				}
    			}

    			if (!current || dirty[0] & /*inputStyle*/ 8388608) {
    				attr(select, "style", /*inputStyle*/ ctx[23]);
    			}

    			if (!current || dirty[0] & /*name*/ 2) {
    				attr(select, "name", /*name*/ ctx[1]);
    			}

    			if (!current || dirty[0] & /*placeholder*/ 8) {
    				attr(select, "placeholder", /*placeholder*/ ctx[3]);
    			}

    			if (!current || dirty[0] & /*inputId*/ 16) {
    				attr(select, "id", /*inputId*/ ctx[4]);
    			}

    			if (!current || dirty[0] & /*size*/ 32) {
    				attr(select, "size", /*size*/ ctx[5]);
    			}

    			if (!current || dirty[0] & /*accept*/ 64) {
    				attr(select, "accept", /*accept*/ ctx[6]);
    			}

    			if (!current || dirty[0] & /*autocomplete*/ 128) {
    				attr(select, "autocomplete", /*autocomplete*/ ctx[7]);
    			}

    			if (!current || dirty[0] & /*autocorrect*/ 256) {
    				attr(select, "autocorrect", /*autocorrect*/ ctx[8]);
    			}

    			if (!current || dirty[0] & /*autocapitalize*/ 512) {
    				attr(select, "autocapitalize", /*autocapitalize*/ ctx[9]);
    			}

    			if (!current || dirty[0] & /*spellcheck*/ 1024) {
    				attr(select, "spellcheck", /*spellcheck*/ ctx[10]);
    			}

    			if (!current || dirty[0] & /*autofocus*/ 2048) {
    				select.autofocus = /*autofocus*/ ctx[11];
    			}

    			if (!current || dirty[0] & /*autosave*/ 4096) {
    				attr(select, "autosave", /*autosave*/ ctx[12]);
    			}

    			if (!current || dirty[0] & /*checked*/ 8192) {
    				attr(select, "checked", /*checked*/ ctx[13]);
    			}

    			if (!current || dirty[0] & /*disabled*/ 16384) {
    				select.disabled = /*disabled*/ ctx[14];
    			}

    			if (!current || dirty[0] & /*max*/ 32768) {
    				attr(select, "max", /*max*/ ctx[15]);
    			}

    			if (!current || dirty[0] & /*maxlength*/ 262144) {
    				attr(select, "maxlength", /*maxlength*/ ctx[18]);
    			}

    			if (!current || dirty[0] & /*min*/ 65536) {
    				attr(select, "min", /*min*/ ctx[16]);
    			}

    			if (!current || dirty[0] & /*minlength*/ 524288) {
    				attr(select, "minlength", /*minlength*/ ctx[19]);
    			}

    			if (!current || dirty[0] & /*step*/ 131072) {
    				attr(select, "step", /*step*/ ctx[17]);
    			}

    			if (!current || dirty[0] & /*multiple*/ 1048576) {
    				select.multiple = /*multiple*/ ctx[20];
    			}

    			if (!current || dirty[0] & /*readonly*/ 2097152) {
    				attr(select, "readonly", /*readonly*/ ctx[21]);
    			}

    			if (!current || dirty[0] & /*required*/ 4194304) {
    				select.required = /*required*/ ctx[22];
    			}

    			if (!current || dirty[0] & /*pattern*/ 16777216) {
    				attr(select, "pattern", /*pattern*/ ctx[24]);
    			}

    			if (!current || dirty[0] & /*validate*/ 33554432 && select_validate_value !== (select_validate_value = typeof /*validate*/ ctx[25] === "string" && /*validate*/ ctx[25].length
    			? /*validate*/ ctx[25]
    			: undefined)) {
    				attr(select, "validate", select_validate_value);
    			}

    			if (!current || dirty[0] & /*validate, validateOnBlur*/ 100663296 && select_data_validate_value !== (select_data_validate_value = /*validate*/ ctx[25] === true || /*validate*/ ctx[25] === "" || /*validateOnBlur*/ ctx[26] === true || /*validateOnBlur*/ ctx[26] === ""
    			? true
    			: undefined)) {
    				attr(select, "data-validate", select_data_validate_value);
    			}

    			if (!current || dirty[0] & /*validateOnBlur*/ 67108864 && select_data_validate_on_blur_value !== (select_data_validate_on_blur_value = /*validateOnBlur*/ ctx[26] === true || /*validateOnBlur*/ ctx[26] === ""
    			? true
    			: undefined)) {
    				attr(select, "data-validate-on-blur", select_data_validate_on_blur_value);
    			}

    			if (!current || dirty[0] & /*tabindex*/ 134217728) {
    				attr(select, "tabindex", /*tabindex*/ ctx[27]);
    			}

    			if (!current || dirty[0] & /*errorMessage*/ 1073741824 | dirty[1] & /*errorMessageForce*/ 1 && select_data_error_message_value !== (select_data_error_message_value = /*errorMessageForce*/ ctx[31]
    			? undefined
    			: /*errorMessage*/ ctx[30])) {
    				attr(select, "data-error-message", select_data_error_message_value);
    			}

    			if (!current || dirty[1] & /*inputClassName*/ 256) {
    				attr(select, "class", /*inputClassName*/ ctx[39]);
    			}

    			if (!current || dirty[1] & /*inputValue*/ 64 && select_value_value !== (select_value_value = /*inputValue*/ ctx[37])) {
    				for (var i = 0; i < select.options.length; i += 1) {
    					var option = select.options[i];

    					if (option.__value === select_value_value) {
    						option.selected = true;
    						break;
    					}
    				}
    			}
    		},
    		i(local) {
    			if (current) return;
    			transition_in(default_slot, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(default_slot, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(select);
    			if (default_slot) default_slot.d(detaching);
    			/*select_binding*/ ctx[75](null);
    			run_all(dispose);
    		}
    	};
    }

    // (484:4) {#if errorMessage && errorMessageForce}
    function create_if_block_3(ctx) {
    	let div;
    	let t;

    	return {
    		c() {
    			div = element("div");
    			t = text(/*errorMessage*/ ctx[30]);
    			attr(div, "class", "input-error-message");
    		},
    		m(target, anchor) {
    			insert(target, div, anchor);
    			append(div, t);
    		},
    		p(ctx, dirty) {
    			if (dirty[0] & /*errorMessage*/ 1073741824) set_data(t, /*errorMessage*/ ctx[30]);
    		},
    		d(detaching) {
    			if (detaching) detach(div);
    		}
    	};
    }

    // (487:4) {#if clearButton}
    function create_if_block_2(ctx) {
    	let span;

    	return {
    		c() {
    			span = element("span");
    			attr(span, "class", "input-clear-button");
    		},
    		m(target, anchor) {
    			insert(target, span, anchor);
    		},
    		d(detaching) {
    			if (detaching) detach(span);
    		}
    	};
    }

    // (490:4) {#if (info || hasInfoSlots)}
    function create_if_block_1(ctx) {
    	let div;
    	let t0;
    	let t1;
    	let current;
    	const info_slot_template = /*$$slots*/ ctx[74].info;
    	const info_slot = create_slot(info_slot_template, ctx, /*$$scope*/ ctx[73], get_info_slot_context);

    	return {
    		c() {
    			div = element("div");
    			t0 = text(/*info*/ ctx[32]);
    			t1 = space();
    			if (info_slot) info_slot.c();
    			attr(div, "class", "input-info");
    		},
    		m(target, anchor) {
    			insert(target, div, anchor);
    			append(div, t0);
    			append(div, t1);

    			if (info_slot) {
    				info_slot.m(div, null);
    			}

    			current = true;
    		},
    		p(ctx, dirty) {
    			if (!current || dirty[1] & /*info*/ 2) set_data(t0, /*info*/ ctx[32]);

    			if (info_slot) {
    				if (info_slot.p && dirty[2] & /*$$scope*/ 2048) {
    					info_slot.p(get_slot_context(info_slot_template, ctx, /*$$scope*/ ctx[73], get_info_slot_context), get_slot_changes(info_slot_template, /*$$scope*/ ctx[73], dirty, get_info_slot_changes));
    				}
    			}
    		},
    		i(local) {
    			if (current) return;
    			transition_in(info_slot, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(info_slot, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(div);
    			if (info_slot) info_slot.d(detaching);
    		}
    	};
    }

    function create_fragment$7(ctx) {
    	let current_block_type_index;
    	let if_block;
    	let if_block_anchor;
    	let current;

    	const if_block_creators = [
    		create_if_block$1,
    		create_if_block_9,
    		create_if_block_10,
    		create_if_block_11,
    		create_if_block_12,
    		create_if_block_13,
    		create_else_block_1
    	];

    	const if_blocks = [];

    	function select_block_type(ctx, dirty) {
    		if (/*wrap*/ ctx[33]) return 0;
    		if (/*type*/ ctx[0] === "select") return 1;
    		if (/*type*/ ctx[0] === "textarea") return 2;
    		if (/*type*/ ctx[0] === "toggle") return 3;
    		if (/*type*/ ctx[0] === "range") return 4;
    		if (/*type*/ ctx[0] === "texteditor") return 5;
    		return 6;
    	}

    	current_block_type_index = select_block_type(ctx);
    	if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);

    	return {
    		c() {
    			if_block.c();
    			if_block_anchor = empty();
    		},
    		m(target, anchor) {
    			if_blocks[current_block_type_index].m(target, anchor);
    			insert(target, if_block_anchor, anchor);
    			current = true;
    		},
    		p(ctx, dirty) {
    			let previous_block_index = current_block_type_index;
    			current_block_type_index = select_block_type(ctx);

    			if (current_block_type_index === previous_block_index) {
    				if_blocks[current_block_type_index].p(ctx, dirty);
    			} else {
    				group_outros();

    				transition_out(if_blocks[previous_block_index], 1, 1, () => {
    					if_blocks[previous_block_index] = null;
    				});

    				check_outros();
    				if_block = if_blocks[current_block_type_index];

    				if (!if_block) {
    					if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);
    					if_block.c();
    				}

    				transition_in(if_block, 1);
    				if_block.m(if_block_anchor.parentNode, if_block_anchor);
    			}
    		},
    		i(local) {
    			if (current) return;
    			transition_in(if_block);
    			current = true;
    		},
    		o(local) {
    			transition_out(if_block);
    			current = false;
    		},
    		d(detaching) {
    			if_blocks[current_block_type_index].d(detaching);
    			if (detaching) detach(if_block_anchor);
    		}
    	};
    }

    function instance$4($$self, $$props, $$invalidate) {
    	const omit_props_names = [
    		"class","type","name","value","placeholder","inputId","size","accept","autocomplete","autocorrect","autocapitalize","spellcheck","autofocus","autosave","checked","disabled","max","min","step","maxlength","minlength","multiple","readonly","required","inputStyle","pattern","validate","validateOnBlur","onValidate","tabindex","resizable","clearButton","noFormStoreData","noStoreData","ignoreStoreData","errorMessage","errorMessageForce","info","outline","wrap","dropdown","calendarParams","colorPickerParams","textEditorParams"
    	];

    	let $$restProps = compute_rest_props($$props, omit_props_names);
    	const dispatch = createEventDispatcher();
    	let { class: className = undefined } = $$props;
    	let { type = undefined } = $$props;
    	let { name = undefined } = $$props;
    	let { value = undefined } = $$props;
    	let { placeholder = undefined } = $$props;
    	let { inputId = undefined } = $$props;
    	let { size = undefined } = $$props;
    	let { accept = undefined } = $$props;
    	let { autocomplete = undefined } = $$props;
    	let { autocorrect = undefined } = $$props;
    	let { autocapitalize = undefined } = $$props;
    	let { spellcheck = undefined } = $$props;
    	let { autofocus = undefined } = $$props;
    	let { autosave = undefined } = $$props;
    	let { checked = undefined } = $$props;
    	let { disabled = undefined } = $$props;
    	let { max = undefined } = $$props;
    	let { min = undefined } = $$props;
    	let { step = undefined } = $$props;
    	let { maxlength = undefined } = $$props;
    	let { minlength = undefined } = $$props;
    	let { multiple = undefined } = $$props;
    	let { readonly = undefined } = $$props;
    	let { required = undefined } = $$props;
    	let { inputStyle = undefined } = $$props;
    	let { pattern = undefined } = $$props;
    	let { validate = undefined } = $$props;
    	let { validateOnBlur = undefined } = $$props;
    	let { onValidate = undefined } = $$props;
    	let { tabindex = undefined } = $$props;
    	let { resizable = undefined } = $$props;
    	let { clearButton = undefined } = $$props;
    	let { noFormStoreData = undefined } = $$props;
    	let { noStoreData = undefined } = $$props;
    	let { ignoreStoreData = undefined } = $$props;
    	let { errorMessage = undefined } = $$props;
    	let { errorMessageForce = undefined } = $$props;
    	let { info = undefined } = $$props;
    	let { outline = undefined } = $$props;
    	let { wrap = true } = $$props;
    	let { dropdown = "auto" } = $$props;
    	let { calendarParams = undefined } = $$props;
    	let { colorPickerParams = undefined } = $$props;
    	let { textEditorParams = undefined } = $$props;

    	// State
    	let inputEl;

    	let inputFocused = false;
    	let inputInvalid = false;
    	let updateInputOnDidUpdate = false;
    	let f7Calendar;
    	let f7ColorPicker;

    	function domValue() {
    		if (!inputEl) return undefined;
    		return inputEl.value;
    	}

    	function inputHasValue() {
    		if (type === "datepicker" && Array.isArray(value) && value.length === 0) {
    			return false;
    		}

    		const domV = domValue();

    		return typeof value === "undefined"
    		? domV || domV === 0
    		: value || value === 0;
    	}

    	function validateInput() {
    		if (!f7.instance || !inputEl) return;
    		const validity = inputEl.validity;
    		if (!validity) return;

    		if (!validity.valid) {
    			if (onValidate) onValidate(false);

    			if (inputInvalid !== true) {
    				$$invalidate(56, inputInvalid = true);
    			}
    		} else if (inputInvalid !== false) {
    			if (onValidate) onValidate(true);
    			$$invalidate(56, inputInvalid = false);
    		}
    	}

    	let initialWatched = false;

    	function watchValue() {
    		if (!initialWatched) {
    			initialWatched = true;
    			return;
    		}

    		if (type === "range" || type === "toggle") return;
    		if (!f7.instance) return;
    		updateInputOnDidUpdate = true;

    		if (f7Calendar) {
    			f7Calendar.setValue(value);
    		}

    		if (f7ColorPicker) {
    			f7ColorPicker.setValue(value);
    		}
    	}

    	function onTextareaResize(event) {
    		dispatch("textareaResize", [event]);
    		if (typeof $$props.onTextareaResize === "function") $$props.onTextareaResize(event);
    	}

    	function onInputNotEmpty(event) {
    		dispatch("inputNotEmpty", [event]);
    		if (typeof $$props.onInputNotEmpty === "function") $$props.onInputNotEmpty(event);
    	}

    	function onInputEmpty(event) {
    		dispatch("inputEmpty", [event]);
    		if (typeof $$props.onInputEmpty === "function") $$props.onInputEmpty(event);
    	}

    	function onInputClear(event) {
    		dispatch("inputClear", [event]);
    		if (typeof $$props.onInputClear === "function") $$props.onInputClear(event);
    	}

    	function onInput(...args) {
    		dispatch("input", [...args]);
    		if (typeof $$props.onInput === "function") $$props.onInput(...args);

    		if (!(validateOnBlur || validateOnBlur === "") && (validate || validate === "") && inputEl) {
    			validateInput();
    		}
    	}

    	function onFocus(...args) {
    		dispatch("focus", [...args]);
    		if (typeof $$props.onFocus === "function") $$props.onFocus(...args);
    		$$invalidate(55, inputFocused = true);
    	}

    	function onBlur(...args) {
    		dispatch("blur", [...args]);
    		if (typeof $$props.onBlur === "function") $$props.onBlur(...args);

    		if ((validate || validate === "" || validateOnBlur || validateOnBlur === "") && inputEl) {
    			validateInput();
    		}

    		$$invalidate(55, inputFocused = false);
    	}

    	function onChange(...args) {
    		dispatch("change", [...args]);
    		if (typeof $$props.onChange === "function") $$props.onChange(...args);

    		if (type === "texteditor") {
    			dispatch("textEditorChange", [args[1]]);
    		}
    	}

    	onMount(() => {
    		f7.ready(() => {
    			if (type === "range" || type === "toggle") return;
    			if (!inputEl) return;
    			inputEl.addEventListener("input:notempty", onInputNotEmpty, false);

    			if (type === "textarea" && resizable) {
    				inputEl.addEventListener("textarea:resize", onTextareaResize, false);
    			}

    			if (clearButton) {
    				inputEl.addEventListener("input:empty", onInputEmpty, false);
    				inputEl.addEventListener("input:clear", onInputClear, false);
    			}

    			if (type === "datepicker") {
    				f7Calendar = f7.instance.calendar.create({
    					inputEl,
    					value,
    					on: {
    						change(calendar, calendarValue) {
    							dispatch("calendarChange", [calendarValue]);
    							if (typeof $$props.onCalendarChange === "function") $$props.onCalendarChange(calendarValue);
    						}
    					},
    					...calendarParams || {}
    				});
    			}

    			if (type === "colorpicker") {
    				f7ColorPicker = f7.instance.colorPicker.create({
    					inputEl,
    					value,
    					on: {
    						change(colorPicker, colorPickerValue) {
    							dispatch("colorpickerChange", [colorPickerValue]);
    							if (typeof $$props.onColorpickerChange === "function") $$props.onColorpickerChange(colorPickerValue);
    						}
    					},
    					...colorPickerParams || {}
    				});
    			}

    			f7.instance.input.checkEmptyState(inputEl);

    			if (!(validateOnBlur || validateOnBlur === "") && (validate || validate === "") && (typeof value !== "undefined" && value !== null && value !== "")) {
    				setTimeout(
    					() => {
    						validateInput();
    					},
    					0
    				);
    			}

    			if (resizable) {
    				f7.instance.input.resizeTextarea(inputEl);
    			}
    		});
    	});

    	afterUpdate(() => {
    		if (!f7.instance) return;

    		if (updateInputOnDidUpdate) {
    			if (!inputEl) return;
    			updateInputOnDidUpdate = false;
    			f7.instance.input.checkEmptyState(inputEl);

    			if (validate && !validateOnBlur) {
    				validateInput();
    			}

    			if (resizable) {
    				f7.instance.input.resizeTextarea(inputEl);
    			}
    		}
    	});

    	onDestroy(() => {
    		if (type === "range" || type === "toggle") return;
    		if (!inputEl) return;
    		inputEl.removeEventListener("input:notempty", onInputNotEmpty, false);

    		if (type === "textarea" && resizable) {
    			inputEl.removeEventListener("textarea:resize", onTextareaResize, false);
    		}

    		if (clearButton) {
    			inputEl.removeEventListener("input:empty", onInputEmpty, false);
    			inputEl.removeEventListener("input:clear", onInputClear, false);
    		}

    		if (f7Calendar && f7Calendar.destroy) {
    			f7Calendar.destroy();
    		}

    		if (f7ColorPicker && f7ColorPicker.destroy) {
    			f7ColorPicker.destroy();
    		}

    		f7Calendar = null;
    		f7ColorPicker = null;
    	});

    	let { $$slots = {}, $$scope } = $$props;

    	function select_binding($$value) {
    		binding_callbacks[$$value ? "unshift" : "push"](() => {
    			$$invalidate(35, inputEl = $$value);
    		});
    	}

    	function textarea_binding($$value) {
    		binding_callbacks[$$value ? "unshift" : "push"](() => {
    			$$invalidate(35, inputEl = $$value);
    		});
    	}

    	function input_binding($$value) {
    		binding_callbacks[$$value ? "unshift" : "push"](() => {
    			$$invalidate(35, inputEl = $$value);
    		});
    	}

    	function select_binding_1($$value) {
    		binding_callbacks[$$value ? "unshift" : "push"](() => {
    			$$invalidate(35, inputEl = $$value);
    		});
    	}

    	function textarea_binding_1($$value) {
    		binding_callbacks[$$value ? "unshift" : "push"](() => {
    			$$invalidate(35, inputEl = $$value);
    		});
    	}

    	function input_binding_1($$value) {
    		binding_callbacks[$$value ? "unshift" : "push"](() => {
    			$$invalidate(35, inputEl = $$value);
    		});
    	}

    	$$self.$set = $$new_props => {
    		$$invalidate(72, $$props = assign(assign({}, $$props), exclude_internal_props($$new_props)));
    		$$invalidate(45, $$restProps = compute_rest_props($$props, omit_props_names));
    		if ("class" in $$new_props) $$invalidate(46, className = $$new_props.class);
    		if ("type" in $$new_props) $$invalidate(0, type = $$new_props.type);
    		if ("name" in $$new_props) $$invalidate(1, name = $$new_props.name);
    		if ("value" in $$new_props) $$invalidate(2, value = $$new_props.value);
    		if ("placeholder" in $$new_props) $$invalidate(3, placeholder = $$new_props.placeholder);
    		if ("inputId" in $$new_props) $$invalidate(4, inputId = $$new_props.inputId);
    		if ("size" in $$new_props) $$invalidate(5, size = $$new_props.size);
    		if ("accept" in $$new_props) $$invalidate(6, accept = $$new_props.accept);
    		if ("autocomplete" in $$new_props) $$invalidate(7, autocomplete = $$new_props.autocomplete);
    		if ("autocorrect" in $$new_props) $$invalidate(8, autocorrect = $$new_props.autocorrect);
    		if ("autocapitalize" in $$new_props) $$invalidate(9, autocapitalize = $$new_props.autocapitalize);
    		if ("spellcheck" in $$new_props) $$invalidate(10, spellcheck = $$new_props.spellcheck);
    		if ("autofocus" in $$new_props) $$invalidate(11, autofocus = $$new_props.autofocus);
    		if ("autosave" in $$new_props) $$invalidate(12, autosave = $$new_props.autosave);
    		if ("checked" in $$new_props) $$invalidate(13, checked = $$new_props.checked);
    		if ("disabled" in $$new_props) $$invalidate(14, disabled = $$new_props.disabled);
    		if ("max" in $$new_props) $$invalidate(15, max = $$new_props.max);
    		if ("min" in $$new_props) $$invalidate(16, min = $$new_props.min);
    		if ("step" in $$new_props) $$invalidate(17, step = $$new_props.step);
    		if ("maxlength" in $$new_props) $$invalidate(18, maxlength = $$new_props.maxlength);
    		if ("minlength" in $$new_props) $$invalidate(19, minlength = $$new_props.minlength);
    		if ("multiple" in $$new_props) $$invalidate(20, multiple = $$new_props.multiple);
    		if ("readonly" in $$new_props) $$invalidate(21, readonly = $$new_props.readonly);
    		if ("required" in $$new_props) $$invalidate(22, required = $$new_props.required);
    		if ("inputStyle" in $$new_props) $$invalidate(23, inputStyle = $$new_props.inputStyle);
    		if ("pattern" in $$new_props) $$invalidate(24, pattern = $$new_props.pattern);
    		if ("validate" in $$new_props) $$invalidate(25, validate = $$new_props.validate);
    		if ("validateOnBlur" in $$new_props) $$invalidate(26, validateOnBlur = $$new_props.validateOnBlur);
    		if ("onValidate" in $$new_props) $$invalidate(47, onValidate = $$new_props.onValidate);
    		if ("tabindex" in $$new_props) $$invalidate(27, tabindex = $$new_props.tabindex);
    		if ("resizable" in $$new_props) $$invalidate(28, resizable = $$new_props.resizable);
    		if ("clearButton" in $$new_props) $$invalidate(29, clearButton = $$new_props.clearButton);
    		if ("noFormStoreData" in $$new_props) $$invalidate(48, noFormStoreData = $$new_props.noFormStoreData);
    		if ("noStoreData" in $$new_props) $$invalidate(49, noStoreData = $$new_props.noStoreData);
    		if ("ignoreStoreData" in $$new_props) $$invalidate(50, ignoreStoreData = $$new_props.ignoreStoreData);
    		if ("errorMessage" in $$new_props) $$invalidate(30, errorMessage = $$new_props.errorMessage);
    		if ("errorMessageForce" in $$new_props) $$invalidate(31, errorMessageForce = $$new_props.errorMessageForce);
    		if ("info" in $$new_props) $$invalidate(32, info = $$new_props.info);
    		if ("outline" in $$new_props) $$invalidate(51, outline = $$new_props.outline);
    		if ("wrap" in $$new_props) $$invalidate(33, wrap = $$new_props.wrap);
    		if ("dropdown" in $$new_props) $$invalidate(52, dropdown = $$new_props.dropdown);
    		if ("calendarParams" in $$new_props) $$invalidate(53, calendarParams = $$new_props.calendarParams);
    		if ("colorPickerParams" in $$new_props) $$invalidate(54, colorPickerParams = $$new_props.colorPickerParams);
    		if ("textEditorParams" in $$new_props) $$invalidate(34, textEditorParams = $$new_props.textEditorParams);
    		if ("$$scope" in $$new_props) $$invalidate(73, $$scope = $$new_props.$$scope);
    	};

    	let inputType;
    	let needsValue;
    	let inputValue;
    	let classes;
    	let wrapClasses;
    	let inputClassName;
    	let hasInfoSlots;

    	$$self.$$.update = () => {
    		if ($$self.$$.dirty[0] & /*value*/ 4) {
    			 watchValue();
    		}

    		if ($$self.$$.dirty[0] & /*type*/ 1) {
    			 $$invalidate(36, inputType = type === "datepicker" || type === "colorpicker"
    			? "text"
    			: type);
    		}

    		if ($$self.$$.dirty[0] & /*type*/ 1) {
    			 needsValue = type !== "file" && type !== "datepicker" && type !== "colorpicker";
    		}

    		if ($$self.$$.dirty[0] & /*value*/ 4) {
    			 $$invalidate(37, inputValue = (() => {
    				let v;

    				if (typeof value !== "undefined") {
    					v = value;
    				} else {
    					v = domValue();
    				}

    				if (typeof v === "undefined" || v === null) return "";
    				return v;
    			})());
    		}

    		if ($$self.$$.dirty[0] & /*resizable, errorMessage*/ 1342177280 | $$self.$$.dirty[1] & /*wrap, className, inputType, noFormStoreData, noStoreData, ignoreStoreData, errorMessageForce, inputInvalid, inputFocused*/ 51281957) {
    			 classes = Utils.classNames(!wrap && className, {
    				resizable: inputType === "textarea" && resizable,
    				"no-store-data": noFormStoreData || noStoreData || ignoreStoreData,
    				"input-invalid": errorMessage && errorMessageForce || inputInvalid,
    				"input-with-value": inputHasValue(),
    				"input-focused": inputFocused
    			});
    		}

    		 $$invalidate(38, wrapClasses = Utils.classNames(
    			className,
    			"input",
    			{
    				"input-outline": outline,
    				"input-dropdown": dropdown === "auto" ? type === "select" : dropdown
    			},
    			Mixins.colorClasses($$props)
    		));

    		if ($$self.$$.dirty[0] & /*resizable, errorMessage*/ 1342177280 | $$self.$$.dirty[1] & /*wrap, className, inputType, noFormStoreData, noStoreData, ignoreStoreData, errorMessageForce, inputInvalid, inputFocused*/ 51281957) {
    			 $$invalidate(39, inputClassName = Utils.classNames(!wrap && className, {
    				resizable: inputType === "textarea" && resizable,
    				"no-store-data": noFormStoreData || noStoreData || ignoreStoreData,
    				"input-invalid": errorMessage && errorMessageForce || inputInvalid,
    				"input-with-value": inputHasValue(),
    				"input-focused": inputFocused
    			}));
    		}
    	};

    	 $$invalidate(40, hasInfoSlots = hasSlots(arguments, "info"));
    	$$props = exclude_internal_props($$props);

    	return [
    		type,
    		name,
    		value,
    		placeholder,
    		inputId,
    		size,
    		accept,
    		autocomplete,
    		autocorrect,
    		autocapitalize,
    		spellcheck,
    		autofocus,
    		autosave,
    		checked,
    		disabled,
    		max,
    		min,
    		step,
    		maxlength,
    		minlength,
    		multiple,
    		readonly,
    		required,
    		inputStyle,
    		pattern,
    		validate,
    		validateOnBlur,
    		tabindex,
    		resizable,
    		clearButton,
    		errorMessage,
    		errorMessageForce,
    		info,
    		wrap,
    		textEditorParams,
    		inputEl,
    		inputType,
    		inputValue,
    		wrapClasses,
    		inputClassName,
    		hasInfoSlots,
    		onInput,
    		onFocus,
    		onBlur,
    		onChange,
    		$$restProps,
    		className,
    		onValidate,
    		noFormStoreData,
    		noStoreData,
    		ignoreStoreData,
    		outline,
    		dropdown,
    		calendarParams,
    		colorPickerParams,
    		inputFocused,
    		inputInvalid,
    		updateInputOnDidUpdate,
    		f7Calendar,
    		f7ColorPicker,
    		initialWatched,
    		needsValue,
    		classes,
    		dispatch,
    		domValue,
    		inputHasValue,
    		validateInput,
    		watchValue,
    		onTextareaResize,
    		onInputNotEmpty,
    		onInputEmpty,
    		onInputClear,
    		$$props,
    		$$scope,
    		$$slots,
    		select_binding,
    		textarea_binding,
    		input_binding,
    		select_binding_1,
    		textarea_binding_1,
    		input_binding_1
    	];
    }

    class Input extends SvelteComponent {
    	constructor(options) {
    		super();

    		init(
    			this,
    			options,
    			instance$4,
    			create_fragment$7,
    			safe_not_equal,
    			{
    				class: 46,
    				type: 0,
    				name: 1,
    				value: 2,
    				placeholder: 3,
    				inputId: 4,
    				size: 5,
    				accept: 6,
    				autocomplete: 7,
    				autocorrect: 8,
    				autocapitalize: 9,
    				spellcheck: 10,
    				autofocus: 11,
    				autosave: 12,
    				checked: 13,
    				disabled: 14,
    				max: 15,
    				min: 16,
    				step: 17,
    				maxlength: 18,
    				minlength: 19,
    				multiple: 20,
    				readonly: 21,
    				required: 22,
    				inputStyle: 23,
    				pattern: 24,
    				validate: 25,
    				validateOnBlur: 26,
    				onValidate: 47,
    				tabindex: 27,
    				resizable: 28,
    				clearButton: 29,
    				noFormStoreData: 48,
    				noStoreData: 49,
    				ignoreStoreData: 50,
    				errorMessage: 30,
    				errorMessageForce: 31,
    				info: 32,
    				outline: 51,
    				wrap: 33,
    				dropdown: 52,
    				calendarParams: 53,
    				colorPickerParams: 54,
    				textEditorParams: 34
    			},
    			[-1, -1, -1]
    		);
    	}
    }

    /* public/packages/svelte/components/link.svelte generated by Svelte v3.22.3 */

    function create_if_block_2$1(ctx) {
    	let current;

    	const icon = new Icon({
    			props: {
    				material: /*$$props*/ ctx[10].iconMaterial,
    				f7: /*$$props*/ ctx[10].iconF7,
    				icon: /*$$props*/ ctx[10].icon,
    				md: /*$$props*/ ctx[10].iconMd,
    				ios: /*$$props*/ ctx[10].iconIos,
    				aurora: /*$$props*/ ctx[10].iconAurora,
    				color: /*$$props*/ ctx[10].iconColor,
    				size: /*$$props*/ ctx[10].iconSize,
    				$$slots: { default: [create_default_slot_1] },
    				$$scope: { ctx }
    			}
    		});

    	return {
    		c() {
    			create_component(icon.$$.fragment);
    		},
    		m(target, anchor) {
    			mount_component(icon, target, anchor);
    			current = true;
    		},
    		p(ctx, dirty) {
    			const icon_changes = {};
    			if (dirty[0] & /*$$props*/ 1024) icon_changes.material = /*$$props*/ ctx[10].iconMaterial;
    			if (dirty[0] & /*$$props*/ 1024) icon_changes.f7 = /*$$props*/ ctx[10].iconF7;
    			if (dirty[0] & /*$$props*/ 1024) icon_changes.icon = /*$$props*/ ctx[10].icon;
    			if (dirty[0] & /*$$props*/ 1024) icon_changes.md = /*$$props*/ ctx[10].iconMd;
    			if (dirty[0] & /*$$props*/ 1024) icon_changes.ios = /*$$props*/ ctx[10].iconIos;
    			if (dirty[0] & /*$$props*/ 1024) icon_changes.aurora = /*$$props*/ ctx[10].iconAurora;
    			if (dirty[0] & /*$$props*/ 1024) icon_changes.color = /*$$props*/ ctx[10].iconColor;
    			if (dirty[0] & /*$$props*/ 1024) icon_changes.size = /*$$props*/ ctx[10].iconSize;

    			if (dirty[0] & /*badgeColor, iconBadge*/ 12 | dirty[1] & /*$$scope*/ 16) {
    				icon_changes.$$scope = { dirty, ctx };
    			}

    			icon.$set(icon_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(icon.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(icon.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			destroy_component(icon, detaching);
    		}
    	};
    }

    // (169:5) {#if iconBadge}
    function create_if_block_3$1(ctx) {
    	let current;

    	const badge_1 = new Badge({
    			props: {
    				color: /*badgeColor*/ ctx[2],
    				$$slots: { default: [create_default_slot_2] },
    				$$scope: { ctx }
    			}
    		});

    	return {
    		c() {
    			create_component(badge_1.$$.fragment);
    		},
    		m(target, anchor) {
    			mount_component(badge_1, target, anchor);
    			current = true;
    		},
    		p(ctx, dirty) {
    			const badge_1_changes = {};
    			if (dirty[0] & /*badgeColor*/ 4) badge_1_changes.color = /*badgeColor*/ ctx[2];

    			if (dirty[0] & /*iconBadge*/ 8 | dirty[1] & /*$$scope*/ 16) {
    				badge_1_changes.$$scope = { dirty, ctx };
    			}

    			badge_1.$set(badge_1_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(badge_1.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(badge_1.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			destroy_component(badge_1, detaching);
    		}
    	};
    }

    // (169:20) <Badge color={badgeColor}>
    function create_default_slot_2(ctx) {
    	let t;

    	return {
    		c() {
    			t = text(/*iconBadge*/ ctx[3]);
    		},
    		m(target, anchor) {
    			insert(target, t, anchor);
    		},
    		p(ctx, dirty) {
    			if (dirty[0] & /*iconBadge*/ 8) set_data(t, /*iconBadge*/ ctx[3]);
    		},
    		d(detaching) {
    			if (detaching) detach(t);
    		}
    	};
    }

    // (160:4) <Icon       material={$$props.iconMaterial}       f7={$$props.iconF7}       icon={$$props.icon}       md={$$props.iconMd}       ios={$$props.iconIos}       aurora={$$props.iconAurora}       color={$$props.iconColor}       size={$$props.iconSize}     >
    function create_default_slot_1(ctx) {
    	let if_block_anchor;
    	let current;
    	let if_block = /*iconBadge*/ ctx[3] && create_if_block_3$1(ctx);

    	return {
    		c() {
    			if (if_block) if_block.c();
    			if_block_anchor = empty();
    		},
    		m(target, anchor) {
    			if (if_block) if_block.m(target, anchor);
    			insert(target, if_block_anchor, anchor);
    			current = true;
    		},
    		p(ctx, dirty) {
    			if (/*iconBadge*/ ctx[3]) {
    				if (if_block) {
    					if_block.p(ctx, dirty);

    					if (dirty[0] & /*iconBadge*/ 8) {
    						transition_in(if_block, 1);
    					}
    				} else {
    					if_block = create_if_block_3$1(ctx);
    					if_block.c();
    					transition_in(if_block, 1);
    					if_block.m(if_block_anchor.parentNode, if_block_anchor);
    				}
    			} else if (if_block) {
    				group_outros();

    				transition_out(if_block, 1, 1, () => {
    					if_block = null;
    				});

    				check_outros();
    			}
    		},
    		i(local) {
    			if (current) return;
    			transition_in(if_block);
    			current = true;
    		},
    		o(local) {
    			transition_out(if_block);
    			current = false;
    		},
    		d(detaching) {
    			if (if_block) if_block.d(detaching);
    			if (detaching) detach(if_block_anchor);
    		}
    	};
    }

    // (172:2) {#if typeof text !== 'undefined' || typeof badge !== 'undefined'}
    function create_if_block$2(ctx) {
    	let span;
    	let t0_value = Utils.text(/*text*/ ctx[0]) + "";
    	let t0;
    	let t1;
    	let current;
    	let if_block = typeof /*badge*/ ctx[1] !== "undefined" && create_if_block_1$1(ctx);

    	return {
    		c() {
    			span = element("span");
    			t0 = text(t0_value);
    			t1 = space();
    			if (if_block) if_block.c();
    			toggle_class(span, "tabbar-label", /*isTabbarLabel*/ ctx[5]);
    		},
    		m(target, anchor) {
    			insert(target, span, anchor);
    			append(span, t0);
    			append(span, t1);
    			if (if_block) if_block.m(span, null);
    			current = true;
    		},
    		p(ctx, dirty) {
    			if ((!current || dirty[0] & /*text*/ 1) && t0_value !== (t0_value = Utils.text(/*text*/ ctx[0]) + "")) set_data(t0, t0_value);

    			if (typeof /*badge*/ ctx[1] !== "undefined") {
    				if (if_block) {
    					if_block.p(ctx, dirty);

    					if (dirty[0] & /*badge*/ 2) {
    						transition_in(if_block, 1);
    					}
    				} else {
    					if_block = create_if_block_1$1(ctx);
    					if_block.c();
    					transition_in(if_block, 1);
    					if_block.m(span, null);
    				}
    			} else if (if_block) {
    				group_outros();

    				transition_out(if_block, 1, 1, () => {
    					if_block = null;
    				});

    				check_outros();
    			}

    			if (dirty[0] & /*isTabbarLabel*/ 32) {
    				toggle_class(span, "tabbar-label", /*isTabbarLabel*/ ctx[5]);
    			}
    		},
    		i(local) {
    			if (current) return;
    			transition_in(if_block);
    			current = true;
    		},
    		o(local) {
    			transition_out(if_block);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(span);
    			if (if_block) if_block.d();
    		}
    	};
    }

    // (175:6) {#if typeof badge !== 'undefined'}
    function create_if_block_1$1(ctx) {
    	let current;

    	const badge_1 = new Badge({
    			props: {
    				color: /*badgeColor*/ ctx[2],
    				$$slots: { default: [create_default_slot] },
    				$$scope: { ctx }
    			}
    		});

    	return {
    		c() {
    			create_component(badge_1.$$.fragment);
    		},
    		m(target, anchor) {
    			mount_component(badge_1, target, anchor);
    			current = true;
    		},
    		p(ctx, dirty) {
    			const badge_1_changes = {};
    			if (dirty[0] & /*badgeColor*/ 4) badge_1_changes.color = /*badgeColor*/ ctx[2];

    			if (dirty[0] & /*badge*/ 2 | dirty[1] & /*$$scope*/ 16) {
    				badge_1_changes.$$scope = { dirty, ctx };
    			}

    			badge_1.$set(badge_1_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(badge_1.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(badge_1.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			destroy_component(badge_1, detaching);
    		}
    	};
    }

    // (175:40) <Badge color={badgeColor}>
    function create_default_slot(ctx) {
    	let t_value = Utils.text(/*badge*/ ctx[1]) + "";
    	let t;

    	return {
    		c() {
    			t = text(t_value);
    		},
    		m(target, anchor) {
    			insert(target, t, anchor);
    		},
    		p(ctx, dirty) {
    			if (dirty[0] & /*badge*/ 2 && t_value !== (t_value = Utils.text(/*badge*/ ctx[1]) + "")) set_data(t, t_value);
    		},
    		d(detaching) {
    			if (detaching) detach(t);
    		}
    	};
    }

    function create_fragment$8(ctx) {
    	let a;
    	let t0;
    	let t1;
    	let current;
    	let dispose;
    	let if_block0 = /*hasIcon*/ ctx[8] && create_if_block_2$1(ctx);
    	const default_slot_template = /*$$slots*/ ctx[33].default;
    	const default_slot = create_slot(default_slot_template, ctx, /*$$scope*/ ctx[35], null);
    	let if_block1 = (typeof /*text*/ ctx[0] !== "undefined" || typeof /*badge*/ ctx[1] !== "undefined") && create_if_block$2(ctx);
    	let a_levels = [{ class: /*classes*/ ctx[7] }, /*attrs*/ ctx[6]];
    	let a_data = {};

    	for (let i = 0; i < a_levels.length; i += 1) {
    		a_data = assign(a_data, a_levels[i]);
    	}

    	return {
    		c() {
    			a = element("a");
    			if (if_block0) if_block0.c();
    			t0 = space();
    			if (default_slot) default_slot.c();
    			t1 = space();
    			if (if_block1) if_block1.c();
    			set_attributes(a, a_data);
    		},
    		m(target, anchor, remount) {
    			insert(target, a, anchor);
    			if (if_block0) if_block0.m(a, null);
    			append(a, t0);

    			if (default_slot) {
    				default_slot.m(a, null);
    			}

    			append(a, t1);
    			if (if_block1) if_block1.m(a, null);
    			/*a_binding*/ ctx[34](a);
    			current = true;
    			if (remount) dispose();
    			dispose = listen(a, "click", /*onClick*/ ctx[9]);
    		},
    		p(ctx, dirty) {
    			if (/*hasIcon*/ ctx[8]) {
    				if (if_block0) {
    					if_block0.p(ctx, dirty);

    					if (dirty[0] & /*hasIcon*/ 256) {
    						transition_in(if_block0, 1);
    					}
    				} else {
    					if_block0 = create_if_block_2$1(ctx);
    					if_block0.c();
    					transition_in(if_block0, 1);
    					if_block0.m(a, t0);
    				}
    			} else if (if_block0) {
    				group_outros();

    				transition_out(if_block0, 1, 1, () => {
    					if_block0 = null;
    				});

    				check_outros();
    			}

    			if (default_slot) {
    				if (default_slot.p && dirty[1] & /*$$scope*/ 16) {
    					default_slot.p(get_slot_context(default_slot_template, ctx, /*$$scope*/ ctx[35], null), get_slot_changes(default_slot_template, /*$$scope*/ ctx[35], dirty, null));
    				}
    			}

    			if (typeof /*text*/ ctx[0] !== "undefined" || typeof /*badge*/ ctx[1] !== "undefined") {
    				if (if_block1) {
    					if_block1.p(ctx, dirty);

    					if (dirty[0] & /*text, badge*/ 3) {
    						transition_in(if_block1, 1);
    					}
    				} else {
    					if_block1 = create_if_block$2(ctx);
    					if_block1.c();
    					transition_in(if_block1, 1);
    					if_block1.m(a, null);
    				}
    			} else if (if_block1) {
    				group_outros();

    				transition_out(if_block1, 1, 1, () => {
    					if_block1 = null;
    				});

    				check_outros();
    			}

    			set_attributes(a, get_spread_update(a_levels, [
    				dirty[0] & /*classes*/ 128 && { class: /*classes*/ ctx[7] },
    				dirty[0] & /*attrs*/ 64 && /*attrs*/ ctx[6]
    			]));
    		},
    		i(local) {
    			if (current) return;
    			transition_in(if_block0);
    			transition_in(default_slot, local);
    			transition_in(if_block1);
    			current = true;
    		},
    		o(local) {
    			transition_out(if_block0);
    			transition_out(default_slot, local);
    			transition_out(if_block1);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(a);
    			if (if_block0) if_block0.d();
    			if (default_slot) default_slot.d(detaching);
    			if (if_block1) if_block1.d();
    			/*a_binding*/ ctx[34](null);
    			dispose();
    		}
    	};
    }

    function instance$5($$self, $$props, $$invalidate) {
    	const omit_props_names = [
    		"class","noLinkClass","text","tabLink","tabLinkActive","tabbarLabel","iconOnly","badge","badgeColor","iconBadge","href","target","tooltip","tooltipTrigger","smartSelect","smartSelectParams"
    	];

    	let $$restProps = compute_rest_props($$props, omit_props_names);
    	const dispatch = createEventDispatcher();
    	let { class: className = undefined } = $$props;
    	let { noLinkClass = false } = $$props;
    	let { text = undefined } = $$props;
    	let { tabLink = undefined } = $$props;
    	let { tabLinkActive = false } = $$props;
    	let { tabbarLabel = false } = $$props;
    	let { iconOnly = false } = $$props;
    	let { badge = undefined } = $$props;
    	let { badgeColor = undefined } = $$props;
    	let { iconBadge = undefined } = $$props;
    	let { href = "#" } = $$props;
    	let { target = undefined } = $$props;
    	let { tooltip = undefined } = $$props;
    	let { tooltipTrigger = undefined } = $$props;
    	let { smartSelect = false } = $$props;
    	let { smartSelectParams = undefined } = $$props;
    	let el;
    	let f7Tooltip;
    	let f7SmartSelect;
    	let isTabbarLabel = tabbarLabel;
    	let tooltipText = tooltip;

    	function watchTooltip(newText) {
    		const oldText = tooltipText;
    		if (oldText === newText) return;
    		tooltipText = newText;

    		if (!newText && f7Tooltip) {
    			f7Tooltip.destroy();
    			f7Tooltip = null;
    			return;
    		}

    		if (newText && !f7Tooltip && f7.instance) {
    			f7Tooltip = f7.instance.tooltip.create({
    				targetEl: el,
    				text: newText,
    				trigger: tooltipTrigger
    			});

    			return;
    		}

    		if (!newText || !f7Tooltip) return;
    		f7Tooltip.setText(newText);
    	}

    	function onClick() {
    		dispatch("click");
    		if (typeof $$props.onClick === "function") $$props.onClick();
    	}

    	onMount(() => {
    		if ($$props.routeProps) {
    			$$invalidate(4, el.f7RouteProps = $$props.routeProps, el);
    		}

    		f7.ready(() => {
    			if (tabbarLabel || (tabLink || tabLink === "") && f7.instance.$(el).parents(".tabbar-labels").length) {
    				$$invalidate(5, isTabbarLabel = true);
    			}

    			if (smartSelect) {
    				const ssParams = Utils.extend({ el }, smartSelectParams || {});
    				f7SmartSelect = f7.instance.smartSelect.create(ssParams);
    			}

    			if (tooltip) {
    				f7Tooltip = f7.instance.tooltip.create({
    					targetEl: el,
    					text: tooltip,
    					trigger: tooltipTrigger
    				});
    			}
    		});
    	});

    	afterUpdate(() => {
    		if ($$props.routeProps) {
    			$$invalidate(4, el.f7RouteProps = $$props.routeProps, el);
    		}
    	});

    	onDestroy(() => {
    		if (el) delete el.f7RouteProps;

    		if (f7SmartSelect && f7SmartSelect.destroy) {
    			f7SmartSelect.destroy();
    			f7SmartSelect = null;
    		}

    		if (f7Tooltip && f7Tooltip.destroy) {
    			f7Tooltip.destroy();
    			f7Tooltip = null;
    		}
    	});

    	let { $$slots = {}, $$scope } = $$props;

    	function a_binding($$value) {
    		binding_callbacks[$$value ? "unshift" : "push"](() => {
    			$$invalidate(4, el = $$value);
    		});
    	}

    	$$self.$set = $$new_props => {
    		$$invalidate(10, $$props = assign(assign({}, $$props), exclude_internal_props($$new_props)));
    		$$invalidate(32, $$restProps = compute_rest_props($$props, omit_props_names));
    		if ("class" in $$new_props) $$invalidate(11, className = $$new_props.class);
    		if ("noLinkClass" in $$new_props) $$invalidate(12, noLinkClass = $$new_props.noLinkClass);
    		if ("text" in $$new_props) $$invalidate(0, text = $$new_props.text);
    		if ("tabLink" in $$new_props) $$invalidate(13, tabLink = $$new_props.tabLink);
    		if ("tabLinkActive" in $$new_props) $$invalidate(14, tabLinkActive = $$new_props.tabLinkActive);
    		if ("tabbarLabel" in $$new_props) $$invalidate(15, tabbarLabel = $$new_props.tabbarLabel);
    		if ("iconOnly" in $$new_props) $$invalidate(16, iconOnly = $$new_props.iconOnly);
    		if ("badge" in $$new_props) $$invalidate(1, badge = $$new_props.badge);
    		if ("badgeColor" in $$new_props) $$invalidate(2, badgeColor = $$new_props.badgeColor);
    		if ("iconBadge" in $$new_props) $$invalidate(3, iconBadge = $$new_props.iconBadge);
    		if ("href" in $$new_props) $$invalidate(17, href = $$new_props.href);
    		if ("target" in $$new_props) $$invalidate(18, target = $$new_props.target);
    		if ("tooltip" in $$new_props) $$invalidate(19, tooltip = $$new_props.tooltip);
    		if ("tooltipTrigger" in $$new_props) $$invalidate(20, tooltipTrigger = $$new_props.tooltipTrigger);
    		if ("smartSelect" in $$new_props) $$invalidate(21, smartSelect = $$new_props.smartSelect);
    		if ("smartSelectParams" in $$new_props) $$invalidate(22, smartSelectParams = $$new_props.smartSelectParams);
    		if ("$$scope" in $$new_props) $$invalidate(35, $$scope = $$new_props.$$scope);
    	};

    	let hrefComputed;
    	let attrs;
    	let hasDefaultSlots;
    	let iconOnlyComputed;
    	let classes;
    	let hasIcon;
    	let hasIconBadge;

    	$$self.$$.update = () => {
    		if ($$self.$$.dirty[0] & /*href*/ 131072) {
    			 $$invalidate(26, hrefComputed = href === true ? "#" : href || undefined);
    		}

    		 $$invalidate(6, attrs = Utils.extend(
    			{
    				href: hrefComputed,
    				target,
    				"data-tab": Utils.isStringProp(tabLink) && tabLink || undefined,
    				...restProps($$restProps)
    			},
    			Mixins.linkRouterAttrs($$props),
    			Mixins.linkActionsAttrs($$props)
    		));

    		if ($$self.$$.dirty[0] & /*iconOnly, text, hasDefaultSlots*/ 134283265) {
    			 $$invalidate(28, iconOnlyComputed = iconOnly || !text && !hasDefaultSlots);
    		}

    		 $$invalidate(7, classes = Utils.classNames(
    			className,
    			{
    				link: !(noLinkClass || isTabbarLabel),
    				"icon-only": iconOnlyComputed,
    				"tab-link": tabLink || tabLink === "",
    				"tab-link-active": tabLinkActive,
    				"smart-select": smartSelect
    			},
    			Mixins.colorClasses($$props),
    			Mixins.linkRouterClasses($$props),
    			Mixins.linkActionsClasses($$props)
    		));

    		 $$invalidate(8, hasIcon = $$props.icon || $$props.iconMaterial || $$props.iconF7 || $$props.iconMd || $$props.iconIos || $$props.iconAurora);
    		 hasIconBadge = $$props.hasIconBadge;

    		if ($$self.$$.dirty[0] & /*tooltip*/ 524288) {
    			 watchTooltip(tooltip);
    		}
    	};

    	 $$invalidate(27, hasDefaultSlots = hasSlots(arguments, "default"));
    	$$props = exclude_internal_props($$props);

    	return [
    		text,
    		badge,
    		badgeColor,
    		iconBadge,
    		el,
    		isTabbarLabel,
    		attrs,
    		classes,
    		hasIcon,
    		onClick,
    		$$props,
    		className,
    		noLinkClass,
    		tabLink,
    		tabLinkActive,
    		tabbarLabel,
    		iconOnly,
    		href,
    		target,
    		tooltip,
    		tooltipTrigger,
    		smartSelect,
    		smartSelectParams,
    		f7Tooltip,
    		f7SmartSelect,
    		tooltipText,
    		hrefComputed,
    		hasDefaultSlots,
    		iconOnlyComputed,
    		hasIconBadge,
    		dispatch,
    		watchTooltip,
    		$$restProps,
    		$$slots,
    		a_binding,
    		$$scope
    	];
    }

    class Link extends SvelteComponent {
    	constructor(options) {
    		super();

    		init(
    			this,
    			options,
    			instance$5,
    			create_fragment$8,
    			safe_not_equal,
    			{
    				class: 11,
    				noLinkClass: 12,
    				text: 0,
    				tabLink: 13,
    				tabLinkActive: 14,
    				tabbarLabel: 15,
    				iconOnly: 16,
    				badge: 1,
    				badgeColor: 2,
    				iconBadge: 3,
    				href: 17,
    				target: 18,
    				tooltip: 19,
    				tooltipTrigger: 20,
    				smartSelect: 21,
    				smartSelectParams: 22
    			},
    			[-1, -1]
    		);
    	}
    }

    /* public/packages/svelte/components/message.svelte generated by Svelte v3.22.3 */
    const get_end_slot_changes = dirty => ({});
    const get_end_slot_context = ctx => ({});
    const get_content_end_slot_changes = dirty => ({});
    const get_content_end_slot_context = ctx => ({});
    const get_footer_slot_changes = dirty => ({});
    const get_footer_slot_context = ctx => ({});
    const get_bubble_end_slot_changes = dirty => ({});
    const get_bubble_end_slot_context = ctx => ({});
    const get_text_footer_slot_changes = dirty => ({});
    const get_text_footer_slot_context = ctx => ({});
    const get_text_slot_changes = dirty => ({});
    const get_text_slot_context = ctx => ({});
    const get_text_header_slot_changes = dirty => ({});
    const get_text_header_slot_context = ctx => ({});
    const get_image_slot_changes = dirty => ({});
    const get_image_slot_context = ctx => ({});
    const get_bubble_start_slot_changes = dirty => ({});
    const get_bubble_start_slot_context = ctx => ({});
    const get_header_slot_changes = dirty => ({});
    const get_header_slot_context = ctx => ({});
    const get_name_slot_changes = dirty => ({});
    const get_name_slot_context = ctx => ({});
    const get_content_start_slot_changes = dirty => ({});
    const get_content_start_slot_context = ctx => ({});
    const get_avatar_slot_changes = dirty => ({});
    const get_avatar_slot_context = ctx => ({});
    const get_start_slot_changes = dirty => ({});
    const get_start_slot_context = ctx => ({});

    // (99:2) {#if (avatar || hasAvatarSlots)}
    function create_if_block_10$1(ctx) {
    	let div;
    	let div_style_value;
    	let current;
    	let dispose;
    	const avatar_slot_template = /*$$slots*/ ctx[39].avatar;
    	const avatar_slot = create_slot(avatar_slot_template, ctx, /*$$scope*/ ctx[38], get_avatar_slot_context);

    	return {
    		c() {
    			div = element("div");
    			if (avatar_slot) avatar_slot.c();
    			attr(div, "class", "message-avatar");

    			attr(div, "style", div_style_value = /*avatar*/ ctx[3]
    			? `background-image: url(${/*avatar*/ ctx[3]})`
    			: undefined);
    		},
    		m(target, anchor, remount) {
    			insert(target, div, anchor);

    			if (avatar_slot) {
    				avatar_slot.m(div, null);
    			}

    			current = true;
    			if (remount) dispose();
    			dispose = listen(div, "click", /*onAvatarClick*/ ctx[22]);
    		},
    		p(ctx, dirty) {
    			if (avatar_slot) {
    				if (avatar_slot.p && dirty[1] & /*$$scope*/ 128) {
    					avatar_slot.p(get_slot_context(avatar_slot_template, ctx, /*$$scope*/ ctx[38], get_avatar_slot_context), get_slot_changes(avatar_slot_template, /*$$scope*/ ctx[38], dirty, get_avatar_slot_changes));
    				}
    			}

    			if (!current || dirty[0] & /*avatar*/ 8 && div_style_value !== (div_style_value = /*avatar*/ ctx[3]
    			? `background-image: url(${/*avatar*/ ctx[3]})`
    			: undefined)) {
    				attr(div, "style", div_style_value);
    			}
    		},
    		i(local) {
    			if (current) return;
    			transition_in(avatar_slot, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(avatar_slot, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(div);
    			if (avatar_slot) avatar_slot.d(detaching);
    			dispose();
    		}
    	};
    }

    // (110:4) {#if (hasNameSlots || name)}
    function create_if_block_9$1(ctx) {
    	let div;
    	let t0_value = Utils.text(/*name*/ ctx[2]) + "";
    	let t0;
    	let t1;
    	let current;
    	let dispose;
    	const name_slot_template = /*$$slots*/ ctx[39].name;
    	const name_slot = create_slot(name_slot_template, ctx, /*$$scope*/ ctx[38], get_name_slot_context);

    	return {
    		c() {
    			div = element("div");
    			t0 = text(t0_value);
    			t1 = space();
    			if (name_slot) name_slot.c();
    			attr(div, "class", "message-name");
    		},
    		m(target, anchor, remount) {
    			insert(target, div, anchor);
    			append(div, t0);
    			append(div, t1);

    			if (name_slot) {
    				name_slot.m(div, null);
    			}

    			current = true;
    			if (remount) dispose();
    			dispose = listen(div, "click", /*onNameClick*/ ctx[20]);
    		},
    		p(ctx, dirty) {
    			if ((!current || dirty[0] & /*name*/ 4) && t0_value !== (t0_value = Utils.text(/*name*/ ctx[2]) + "")) set_data(t0, t0_value);

    			if (name_slot) {
    				if (name_slot.p && dirty[1] & /*$$scope*/ 128) {
    					name_slot.p(get_slot_context(name_slot_template, ctx, /*$$scope*/ ctx[38], get_name_slot_context), get_slot_changes(name_slot_template, /*$$scope*/ ctx[38], dirty, get_name_slot_changes));
    				}
    			}
    		},
    		i(local) {
    			if (current) return;
    			transition_in(name_slot, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(name_slot, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(div);
    			if (name_slot) name_slot.d(detaching);
    			dispose();
    		}
    	};
    }

    // (116:4) {#if (hasHeaderSlots || header)}
    function create_if_block_8$1(ctx) {
    	let div;
    	let t0_value = Utils.text(/*header*/ ctx[5]) + "";
    	let t0;
    	let t1;
    	let current;
    	let dispose;
    	const header_slot_template = /*$$slots*/ ctx[39].header;
    	const header_slot = create_slot(header_slot_template, ctx, /*$$scope*/ ctx[38], get_header_slot_context);

    	return {
    		c() {
    			div = element("div");
    			t0 = text(t0_value);
    			t1 = space();
    			if (header_slot) header_slot.c();
    			attr(div, "class", "message-header");
    		},
    		m(target, anchor, remount) {
    			insert(target, div, anchor);
    			append(div, t0);
    			append(div, t1);

    			if (header_slot) {
    				header_slot.m(div, null);
    			}

    			current = true;
    			if (remount) dispose();
    			dispose = listen(div, "click", /*onHeaderClick*/ ctx[23]);
    		},
    		p(ctx, dirty) {
    			if ((!current || dirty[0] & /*header*/ 32) && t0_value !== (t0_value = Utils.text(/*header*/ ctx[5]) + "")) set_data(t0, t0_value);

    			if (header_slot) {
    				if (header_slot.p && dirty[1] & /*$$scope*/ 128) {
    					header_slot.p(get_slot_context(header_slot_template, ctx, /*$$scope*/ ctx[38], get_header_slot_context), get_slot_changes(header_slot_template, /*$$scope*/ ctx[38], dirty, get_header_slot_changes));
    				}
    			}
    		},
    		i(local) {
    			if (current) return;
    			transition_in(header_slot, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(header_slot, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(div);
    			if (header_slot) header_slot.d(detaching);
    			dispose();
    		}
    	};
    }

    // (124:6) {#if (hasImageSlots || image)}
    function create_if_block_6$1(ctx) {
    	let div;
    	let t;
    	let current;
    	let if_block = /*image*/ ctx[4] && create_if_block_7$1(ctx);
    	const image_slot_template = /*$$slots*/ ctx[39].image;
    	const image_slot = create_slot(image_slot_template, ctx, /*$$scope*/ ctx[38], get_image_slot_context);

    	return {
    		c() {
    			div = element("div");
    			if (if_block) if_block.c();
    			t = space();
    			if (image_slot) image_slot.c();
    			attr(div, "class", "message-image");
    		},
    		m(target, anchor) {
    			insert(target, div, anchor);
    			if (if_block) if_block.m(div, null);
    			append(div, t);

    			if (image_slot) {
    				image_slot.m(div, null);
    			}

    			current = true;
    		},
    		p(ctx, dirty) {
    			if (/*image*/ ctx[4]) {
    				if (if_block) {
    					if_block.p(ctx, dirty);
    				} else {
    					if_block = create_if_block_7$1(ctx);
    					if_block.c();
    					if_block.m(div, t);
    				}
    			} else if (if_block) {
    				if_block.d(1);
    				if_block = null;
    			}

    			if (image_slot) {
    				if (image_slot.p && dirty[1] & /*$$scope*/ 128) {
    					image_slot.p(get_slot_context(image_slot_template, ctx, /*$$scope*/ ctx[38], get_image_slot_context), get_slot_changes(image_slot_template, /*$$scope*/ ctx[38], dirty, get_image_slot_changes));
    				}
    			}
    		},
    		i(local) {
    			if (current) return;
    			transition_in(image_slot, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(image_slot, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(div);
    			if (if_block) if_block.d();
    			if (image_slot) image_slot.d(detaching);
    		}
    	};
    }

    // (126:10) {#if image}
    function create_if_block_7$1(ctx) {
    	let img;
    	let img_src_value;

    	return {
    		c() {
    			img = element("img");
    			if (img.src !== (img_src_value = /*image*/ ctx[4])) attr(img, "src", img_src_value);
    		},
    		m(target, anchor) {
    			insert(target, img, anchor);
    		},
    		p(ctx, dirty) {
    			if (dirty[0] & /*image*/ 16 && img.src !== (img_src_value = /*image*/ ctx[4])) {
    				attr(img, "src", img_src_value);
    			}
    		},
    		d(detaching) {
    			if (detaching) detach(img);
    		}
    	};
    }

    // (132:6) {#if (hasTextHeaderSlots || textHeader)}
    function create_if_block_5$1(ctx) {
    	let div;
    	let t0_value = Utils.text(/*textHeader*/ ctx[7]) + "";
    	let t0;
    	let t1;
    	let current;
    	const text_header_slot_template = /*$$slots*/ ctx[39]["text-header"];
    	const text_header_slot = create_slot(text_header_slot_template, ctx, /*$$scope*/ ctx[38], get_text_header_slot_context);

    	return {
    		c() {
    			div = element("div");
    			t0 = text(t0_value);
    			t1 = space();
    			if (text_header_slot) text_header_slot.c();
    			attr(div, "class", "message-text-header");
    		},
    		m(target, anchor) {
    			insert(target, div, anchor);
    			append(div, t0);
    			append(div, t1);

    			if (text_header_slot) {
    				text_header_slot.m(div, null);
    			}

    			current = true;
    		},
    		p(ctx, dirty) {
    			if ((!current || dirty[0] & /*textHeader*/ 128) && t0_value !== (t0_value = Utils.text(/*textHeader*/ ctx[7]) + "")) set_data(t0, t0_value);

    			if (text_header_slot) {
    				if (text_header_slot.p && dirty[1] & /*$$scope*/ 128) {
    					text_header_slot.p(get_slot_context(text_header_slot_template, ctx, /*$$scope*/ ctx[38], get_text_header_slot_context), get_slot_changes(text_header_slot_template, /*$$scope*/ ctx[38], dirty, get_text_header_slot_changes));
    				}
    			}
    		},
    		i(local) {
    			if (current) return;
    			transition_in(text_header_slot, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(text_header_slot, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(div);
    			if (text_header_slot) text_header_slot.d(detaching);
    		}
    	};
    }

    // (138:6) {#if (hasTextSlots || text || htmlText || typing)}
    function create_if_block_2$2(ctx) {
    	let div;
    	let t0_value = Utils.text(/*text*/ ctx[0]) + "";
    	let t0;
    	let t1;
    	let t2;
    	let t3;
    	let current;
    	let dispose;
    	let if_block0 = /*htmlText*/ ctx[1] && create_if_block_4$1(ctx);
    	const text_slot_template = /*$$slots*/ ctx[39].text;
    	const text_slot = create_slot(text_slot_template, ctx, /*$$scope*/ ctx[38], get_text_slot_context);
    	let if_block1 = /*typing*/ ctx[9] && create_if_block_3$2();

    	return {
    		c() {
    			div = element("div");
    			t0 = text(t0_value);
    			t1 = space();
    			if (if_block0) if_block0.c();
    			t2 = space();
    			if (text_slot) text_slot.c();
    			t3 = space();
    			if (if_block1) if_block1.c();
    			attr(div, "class", "message-text");
    		},
    		m(target, anchor, remount) {
    			insert(target, div, anchor);
    			append(div, t0);
    			append(div, t1);
    			if (if_block0) if_block0.m(div, null);
    			append(div, t2);

    			if (text_slot) {
    				text_slot.m(div, null);
    			}

    			append(div, t3);
    			if (if_block1) if_block1.m(div, null);
    			current = true;
    			if (remount) dispose();
    			dispose = listen(div, "click", /*onTextClick*/ ctx[21]);
    		},
    		p(ctx, dirty) {
    			if ((!current || dirty[0] & /*text*/ 1) && t0_value !== (t0_value = Utils.text(/*text*/ ctx[0]) + "")) set_data(t0, t0_value);

    			if (/*htmlText*/ ctx[1]) {
    				if (if_block0) {
    					if_block0.p(ctx, dirty);
    				} else {
    					if_block0 = create_if_block_4$1(ctx);
    					if_block0.c();
    					if_block0.m(div, t2);
    				}
    			} else if (if_block0) {
    				if_block0.d(1);
    				if_block0 = null;
    			}

    			if (text_slot) {
    				if (text_slot.p && dirty[1] & /*$$scope*/ 128) {
    					text_slot.p(get_slot_context(text_slot_template, ctx, /*$$scope*/ ctx[38], get_text_slot_context), get_slot_changes(text_slot_template, /*$$scope*/ ctx[38], dirty, get_text_slot_changes));
    				}
    			}

    			if (/*typing*/ ctx[9]) {
    				if (if_block1) ; else {
    					if_block1 = create_if_block_3$2();
    					if_block1.c();
    					if_block1.m(div, null);
    				}
    			} else if (if_block1) {
    				if_block1.d(1);
    				if_block1 = null;
    			}
    		},
    		i(local) {
    			if (current) return;
    			transition_in(text_slot, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(text_slot, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(div);
    			if (if_block0) if_block0.d();
    			if (text_slot) text_slot.d(detaching);
    			if (if_block1) if_block1.d();
    			dispose();
    		}
    	};
    }

    // (141:10) {#if htmlText}
    function create_if_block_4$1(ctx) {
    	let html_tag;

    	return {
    		c() {
    			html_tag = new HtmlTag(/*htmlText*/ ctx[1], null);
    		},
    		m(target, anchor) {
    			html_tag.m(target, anchor);
    		},
    		p(ctx, dirty) {
    			if (dirty[0] & /*htmlText*/ 2) html_tag.p(/*htmlText*/ ctx[1]);
    		},
    		d(detaching) {
    			if (detaching) html_tag.d();
    		}
    	};
    }

    // (143:10) {#if typing}
    function create_if_block_3$2(ctx) {
    	let div3;

    	return {
    		c() {
    			div3 = element("div");

    			div3.innerHTML = `<div></div> 
              <div></div> 
              <div></div>`;

    			attr(div3, "class", "message-typing-indicator");
    		},
    		m(target, anchor) {
    			insert(target, div3, anchor);
    		},
    		d(detaching) {
    			if (detaching) detach(div3);
    		}
    	};
    }

    // (152:6) {#if (hasTextFooterSlots || textFooter)}
    function create_if_block_1$2(ctx) {
    	let div;
    	let t0_value = Utils.text(/*textFooter*/ ctx[8]) + "";
    	let t0;
    	let t1;
    	let current;
    	const text_footer_slot_template = /*$$slots*/ ctx[39]["text-footer"];
    	const text_footer_slot = create_slot(text_footer_slot_template, ctx, /*$$scope*/ ctx[38], get_text_footer_slot_context);

    	return {
    		c() {
    			div = element("div");
    			t0 = text(t0_value);
    			t1 = space();
    			if (text_footer_slot) text_footer_slot.c();
    			attr(div, "class", "message-text-footer");
    		},
    		m(target, anchor) {
    			insert(target, div, anchor);
    			append(div, t0);
    			append(div, t1);

    			if (text_footer_slot) {
    				text_footer_slot.m(div, null);
    			}

    			current = true;
    		},
    		p(ctx, dirty) {
    			if ((!current || dirty[0] & /*textFooter*/ 256) && t0_value !== (t0_value = Utils.text(/*textFooter*/ ctx[8]) + "")) set_data(t0, t0_value);

    			if (text_footer_slot) {
    				if (text_footer_slot.p && dirty[1] & /*$$scope*/ 128) {
    					text_footer_slot.p(get_slot_context(text_footer_slot_template, ctx, /*$$scope*/ ctx[38], get_text_footer_slot_context), get_slot_changes(text_footer_slot_template, /*$$scope*/ ctx[38], dirty, get_text_footer_slot_changes));
    				}
    			}
    		},
    		i(local) {
    			if (current) return;
    			transition_in(text_footer_slot, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(text_footer_slot, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(div);
    			if (text_footer_slot) text_footer_slot.d(detaching);
    		}
    	};
    }

    // (161:4) {#if (hasFooterSlots || footer)}
    function create_if_block$3(ctx) {
    	let div;
    	let t0_value = Utils.text(/*footer*/ ctx[6]) + "";
    	let t0;
    	let t1;
    	let current;
    	let dispose;
    	const footer_slot_template = /*$$slots*/ ctx[39].footer;
    	const footer_slot = create_slot(footer_slot_template, ctx, /*$$scope*/ ctx[38], get_footer_slot_context);

    	return {
    		c() {
    			div = element("div");
    			t0 = text(t0_value);
    			t1 = space();
    			if (footer_slot) footer_slot.c();
    			attr(div, "class", "message-footer");
    		},
    		m(target, anchor, remount) {
    			insert(target, div, anchor);
    			append(div, t0);
    			append(div, t1);

    			if (footer_slot) {
    				footer_slot.m(div, null);
    			}

    			current = true;
    			if (remount) dispose();
    			dispose = listen(div, "click", /*onFooterClick*/ ctx[24]);
    		},
    		p(ctx, dirty) {
    			if ((!current || dirty[0] & /*footer*/ 64) && t0_value !== (t0_value = Utils.text(/*footer*/ ctx[6]) + "")) set_data(t0, t0_value);

    			if (footer_slot) {
    				if (footer_slot.p && dirty[1] & /*$$scope*/ 128) {
    					footer_slot.p(get_slot_context(footer_slot_template, ctx, /*$$scope*/ ctx[38], get_footer_slot_context), get_slot_changes(footer_slot_template, /*$$scope*/ ctx[38], dirty, get_footer_slot_changes));
    				}
    			}
    		},
    		i(local) {
    			if (current) return;
    			transition_in(footer_slot, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(footer_slot, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(div);
    			if (footer_slot) footer_slot.d(detaching);
    			dispose();
    		}
    	};
    }

    function create_fragment$9(ctx) {
    	let div2;
    	let t0;
    	let t1;
    	let div1;
    	let t2;
    	let t3;
    	let t4;
    	let div0;
    	let t5;
    	let t6;
    	let t7;
    	let t8;
    	let t9;
    	let t10;
    	let t11;
    	let t12;
    	let t13;
    	let current;
    	let dispose;
    	const start_slot_template = /*$$slots*/ ctx[39].start;
    	const start_slot = create_slot(start_slot_template, ctx, /*$$scope*/ ctx[38], get_start_slot_context);
    	let if_block0 = (/*avatar*/ ctx[3] || /*hasAvatarSlots*/ ctx[11]) && create_if_block_10$1(ctx);
    	const content_start_slot_template = /*$$slots*/ ctx[39]["content-start"];
    	const content_start_slot = create_slot(content_start_slot_template, ctx, /*$$scope*/ ctx[38], get_content_start_slot_context);
    	let if_block1 = (/*hasNameSlots*/ ctx[12] || /*name*/ ctx[2]) && create_if_block_9$1(ctx);
    	let if_block2 = (/*hasHeaderSlots*/ ctx[13] || /*header*/ ctx[5]) && create_if_block_8$1(ctx);
    	const bubble_start_slot_template = /*$$slots*/ ctx[39]["bubble-start"];
    	const bubble_start_slot = create_slot(bubble_start_slot_template, ctx, /*$$scope*/ ctx[38], get_bubble_start_slot_context);
    	let if_block3 = (/*hasImageSlots*/ ctx[14] || /*image*/ ctx[4]) && create_if_block_6$1(ctx);
    	let if_block4 = (/*hasTextHeaderSlots*/ ctx[15] || /*textHeader*/ ctx[7]) && create_if_block_5$1(ctx);
    	let if_block5 = (/*hasTextSlots*/ ctx[17] || /*text*/ ctx[0] || /*htmlText*/ ctx[1] || /*typing*/ ctx[9]) && create_if_block_2$2(ctx);
    	let if_block6 = (/*hasTextFooterSlots*/ ctx[16] || /*textFooter*/ ctx[8]) && create_if_block_1$2(ctx);
    	const bubble_end_slot_template = /*$$slots*/ ctx[39]["bubble-end"];
    	const bubble_end_slot = create_slot(bubble_end_slot_template, ctx, /*$$scope*/ ctx[38], get_bubble_end_slot_context);
    	const default_slot_template = /*$$slots*/ ctx[39].default;
    	const default_slot = create_slot(default_slot_template, ctx, /*$$scope*/ ctx[38], null);
    	let if_block7 = (/*hasFooterSlots*/ ctx[18] || /*footer*/ ctx[6]) && create_if_block$3(ctx);
    	const content_end_slot_template = /*$$slots*/ ctx[39]["content-end"];
    	const content_end_slot = create_slot(content_end_slot_template, ctx, /*$$scope*/ ctx[38], get_content_end_slot_context);
    	const end_slot_template = /*$$slots*/ ctx[39].end;
    	const end_slot = create_slot(end_slot_template, ctx, /*$$scope*/ ctx[38], get_end_slot_context);
    	let div2_levels = [{ class: /*classes*/ ctx[10] }, restProps(/*$$restProps*/ ctx[26])];
    	let div2_data = {};

    	for (let i = 0; i < div2_levels.length; i += 1) {
    		div2_data = assign(div2_data, div2_levels[i]);
    	}

    	return {
    		c() {
    			div2 = element("div");
    			if (start_slot) start_slot.c();
    			t0 = space();
    			if (if_block0) if_block0.c();
    			t1 = space();
    			div1 = element("div");
    			if (content_start_slot) content_start_slot.c();
    			t2 = space();
    			if (if_block1) if_block1.c();
    			t3 = space();
    			if (if_block2) if_block2.c();
    			t4 = space();
    			div0 = element("div");
    			if (bubble_start_slot) bubble_start_slot.c();
    			t5 = space();
    			if (if_block3) if_block3.c();
    			t6 = space();
    			if (if_block4) if_block4.c();
    			t7 = space();
    			if (if_block5) if_block5.c();
    			t8 = space();
    			if (if_block6) if_block6.c();
    			t9 = space();
    			if (bubble_end_slot) bubble_end_slot.c();
    			t10 = space();
    			if (default_slot) default_slot.c();
    			t11 = space();
    			if (if_block7) if_block7.c();
    			t12 = space();
    			if (content_end_slot) content_end_slot.c();
    			t13 = space();
    			if (end_slot) end_slot.c();
    			attr(div0, "class", "message-bubble");
    			attr(div1, "class", "message-content");
    			set_attributes(div2, div2_data);
    		},
    		m(target, anchor, remount) {
    			insert(target, div2, anchor);

    			if (start_slot) {
    				start_slot.m(div2, null);
    			}

    			append(div2, t0);
    			if (if_block0) if_block0.m(div2, null);
    			append(div2, t1);
    			append(div2, div1);

    			if (content_start_slot) {
    				content_start_slot.m(div1, null);
    			}

    			append(div1, t2);
    			if (if_block1) if_block1.m(div1, null);
    			append(div1, t3);
    			if (if_block2) if_block2.m(div1, null);
    			append(div1, t4);
    			append(div1, div0);

    			if (bubble_start_slot) {
    				bubble_start_slot.m(div0, null);
    			}

    			append(div0, t5);
    			if (if_block3) if_block3.m(div0, null);
    			append(div0, t6);
    			if (if_block4) if_block4.m(div0, null);
    			append(div0, t7);
    			if (if_block5) if_block5.m(div0, null);
    			append(div0, t8);
    			if (if_block6) if_block6.m(div0, null);
    			append(div0, t9);

    			if (bubble_end_slot) {
    				bubble_end_slot.m(div0, null);
    			}

    			append(div0, t10);

    			if (default_slot) {
    				default_slot.m(div0, null);
    			}

    			append(div1, t11);
    			if (if_block7) if_block7.m(div1, null);
    			append(div1, t12);

    			if (content_end_slot) {
    				content_end_slot.m(div1, null);
    			}

    			append(div2, t13);

    			if (end_slot) {
    				end_slot.m(div2, null);
    			}

    			current = true;
    			if (remount) run_all(dispose);

    			dispose = [
    				listen(div0, "click", /*onBubbleClick*/ ctx[25]),
    				listen(div2, "click", /*onClick*/ ctx[19])
    			];
    		},
    		p(ctx, dirty) {
    			if (start_slot) {
    				if (start_slot.p && dirty[1] & /*$$scope*/ 128) {
    					start_slot.p(get_slot_context(start_slot_template, ctx, /*$$scope*/ ctx[38], get_start_slot_context), get_slot_changes(start_slot_template, /*$$scope*/ ctx[38], dirty, get_start_slot_changes));
    				}
    			}

    			if (/*avatar*/ ctx[3] || /*hasAvatarSlots*/ ctx[11]) {
    				if (if_block0) {
    					if_block0.p(ctx, dirty);

    					if (dirty[0] & /*avatar, hasAvatarSlots*/ 2056) {
    						transition_in(if_block0, 1);
    					}
    				} else {
    					if_block0 = create_if_block_10$1(ctx);
    					if_block0.c();
    					transition_in(if_block0, 1);
    					if_block0.m(div2, t1);
    				}
    			} else if (if_block0) {
    				group_outros();

    				transition_out(if_block0, 1, 1, () => {
    					if_block0 = null;
    				});

    				check_outros();
    			}

    			if (content_start_slot) {
    				if (content_start_slot.p && dirty[1] & /*$$scope*/ 128) {
    					content_start_slot.p(get_slot_context(content_start_slot_template, ctx, /*$$scope*/ ctx[38], get_content_start_slot_context), get_slot_changes(content_start_slot_template, /*$$scope*/ ctx[38], dirty, get_content_start_slot_changes));
    				}
    			}

    			if (/*hasNameSlots*/ ctx[12] || /*name*/ ctx[2]) {
    				if (if_block1) {
    					if_block1.p(ctx, dirty);

    					if (dirty[0] & /*hasNameSlots, name*/ 4100) {
    						transition_in(if_block1, 1);
    					}
    				} else {
    					if_block1 = create_if_block_9$1(ctx);
    					if_block1.c();
    					transition_in(if_block1, 1);
    					if_block1.m(div1, t3);
    				}
    			} else if (if_block1) {
    				group_outros();

    				transition_out(if_block1, 1, 1, () => {
    					if_block1 = null;
    				});

    				check_outros();
    			}

    			if (/*hasHeaderSlots*/ ctx[13] || /*header*/ ctx[5]) {
    				if (if_block2) {
    					if_block2.p(ctx, dirty);

    					if (dirty[0] & /*hasHeaderSlots, header*/ 8224) {
    						transition_in(if_block2, 1);
    					}
    				} else {
    					if_block2 = create_if_block_8$1(ctx);
    					if_block2.c();
    					transition_in(if_block2, 1);
    					if_block2.m(div1, t4);
    				}
    			} else if (if_block2) {
    				group_outros();

    				transition_out(if_block2, 1, 1, () => {
    					if_block2 = null;
    				});

    				check_outros();
    			}

    			if (bubble_start_slot) {
    				if (bubble_start_slot.p && dirty[1] & /*$$scope*/ 128) {
    					bubble_start_slot.p(get_slot_context(bubble_start_slot_template, ctx, /*$$scope*/ ctx[38], get_bubble_start_slot_context), get_slot_changes(bubble_start_slot_template, /*$$scope*/ ctx[38], dirty, get_bubble_start_slot_changes));
    				}
    			}

    			if (/*hasImageSlots*/ ctx[14] || /*image*/ ctx[4]) {
    				if (if_block3) {
    					if_block3.p(ctx, dirty);

    					if (dirty[0] & /*hasImageSlots, image*/ 16400) {
    						transition_in(if_block3, 1);
    					}
    				} else {
    					if_block3 = create_if_block_6$1(ctx);
    					if_block3.c();
    					transition_in(if_block3, 1);
    					if_block3.m(div0, t6);
    				}
    			} else if (if_block3) {
    				group_outros();

    				transition_out(if_block3, 1, 1, () => {
    					if_block3 = null;
    				});

    				check_outros();
    			}

    			if (/*hasTextHeaderSlots*/ ctx[15] || /*textHeader*/ ctx[7]) {
    				if (if_block4) {
    					if_block4.p(ctx, dirty);

    					if (dirty[0] & /*hasTextHeaderSlots, textHeader*/ 32896) {
    						transition_in(if_block4, 1);
    					}
    				} else {
    					if_block4 = create_if_block_5$1(ctx);
    					if_block4.c();
    					transition_in(if_block4, 1);
    					if_block4.m(div0, t7);
    				}
    			} else if (if_block4) {
    				group_outros();

    				transition_out(if_block4, 1, 1, () => {
    					if_block4 = null;
    				});

    				check_outros();
    			}

    			if (/*hasTextSlots*/ ctx[17] || /*text*/ ctx[0] || /*htmlText*/ ctx[1] || /*typing*/ ctx[9]) {
    				if (if_block5) {
    					if_block5.p(ctx, dirty);

    					if (dirty[0] & /*hasTextSlots, text, htmlText, typing*/ 131587) {
    						transition_in(if_block5, 1);
    					}
    				} else {
    					if_block5 = create_if_block_2$2(ctx);
    					if_block5.c();
    					transition_in(if_block5, 1);
    					if_block5.m(div0, t8);
    				}
    			} else if (if_block5) {
    				group_outros();

    				transition_out(if_block5, 1, 1, () => {
    					if_block5 = null;
    				});

    				check_outros();
    			}

    			if (/*hasTextFooterSlots*/ ctx[16] || /*textFooter*/ ctx[8]) {
    				if (if_block6) {
    					if_block6.p(ctx, dirty);

    					if (dirty[0] & /*hasTextFooterSlots, textFooter*/ 65792) {
    						transition_in(if_block6, 1);
    					}
    				} else {
    					if_block6 = create_if_block_1$2(ctx);
    					if_block6.c();
    					transition_in(if_block6, 1);
    					if_block6.m(div0, t9);
    				}
    			} else if (if_block6) {
    				group_outros();

    				transition_out(if_block6, 1, 1, () => {
    					if_block6 = null;
    				});

    				check_outros();
    			}

    			if (bubble_end_slot) {
    				if (bubble_end_slot.p && dirty[1] & /*$$scope*/ 128) {
    					bubble_end_slot.p(get_slot_context(bubble_end_slot_template, ctx, /*$$scope*/ ctx[38], get_bubble_end_slot_context), get_slot_changes(bubble_end_slot_template, /*$$scope*/ ctx[38], dirty, get_bubble_end_slot_changes));
    				}
    			}

    			if (default_slot) {
    				if (default_slot.p && dirty[1] & /*$$scope*/ 128) {
    					default_slot.p(get_slot_context(default_slot_template, ctx, /*$$scope*/ ctx[38], null), get_slot_changes(default_slot_template, /*$$scope*/ ctx[38], dirty, null));
    				}
    			}

    			if (/*hasFooterSlots*/ ctx[18] || /*footer*/ ctx[6]) {
    				if (if_block7) {
    					if_block7.p(ctx, dirty);

    					if (dirty[0] & /*hasFooterSlots, footer*/ 262208) {
    						transition_in(if_block7, 1);
    					}
    				} else {
    					if_block7 = create_if_block$3(ctx);
    					if_block7.c();
    					transition_in(if_block7, 1);
    					if_block7.m(div1, t12);
    				}
    			} else if (if_block7) {
    				group_outros();

    				transition_out(if_block7, 1, 1, () => {
    					if_block7 = null;
    				});

    				check_outros();
    			}

    			if (content_end_slot) {
    				if (content_end_slot.p && dirty[1] & /*$$scope*/ 128) {
    					content_end_slot.p(get_slot_context(content_end_slot_template, ctx, /*$$scope*/ ctx[38], get_content_end_slot_context), get_slot_changes(content_end_slot_template, /*$$scope*/ ctx[38], dirty, get_content_end_slot_changes));
    				}
    			}

    			if (end_slot) {
    				if (end_slot.p && dirty[1] & /*$$scope*/ 128) {
    					end_slot.p(get_slot_context(end_slot_template, ctx, /*$$scope*/ ctx[38], get_end_slot_context), get_slot_changes(end_slot_template, /*$$scope*/ ctx[38], dirty, get_end_slot_changes));
    				}
    			}

    			set_attributes(div2, get_spread_update(div2_levels, [
    				dirty[0] & /*classes*/ 1024 && { class: /*classes*/ ctx[10] },
    				dirty[0] & /*$$restProps*/ 67108864 && restProps(/*$$restProps*/ ctx[26])
    			]));
    		},
    		i(local) {
    			if (current) return;
    			transition_in(start_slot, local);
    			transition_in(if_block0);
    			transition_in(content_start_slot, local);
    			transition_in(if_block1);
    			transition_in(if_block2);
    			transition_in(bubble_start_slot, local);
    			transition_in(if_block3);
    			transition_in(if_block4);
    			transition_in(if_block5);
    			transition_in(if_block6);
    			transition_in(bubble_end_slot, local);
    			transition_in(default_slot, local);
    			transition_in(if_block7);
    			transition_in(content_end_slot, local);
    			transition_in(end_slot, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(start_slot, local);
    			transition_out(if_block0);
    			transition_out(content_start_slot, local);
    			transition_out(if_block1);
    			transition_out(if_block2);
    			transition_out(bubble_start_slot, local);
    			transition_out(if_block3);
    			transition_out(if_block4);
    			transition_out(if_block5);
    			transition_out(if_block6);
    			transition_out(bubble_end_slot, local);
    			transition_out(default_slot, local);
    			transition_out(if_block7);
    			transition_out(content_end_slot, local);
    			transition_out(end_slot, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(div2);
    			if (start_slot) start_slot.d(detaching);
    			if (if_block0) if_block0.d();
    			if (content_start_slot) content_start_slot.d(detaching);
    			if (if_block1) if_block1.d();
    			if (if_block2) if_block2.d();
    			if (bubble_start_slot) bubble_start_slot.d(detaching);
    			if (if_block3) if_block3.d();
    			if (if_block4) if_block4.d();
    			if (if_block5) if_block5.d();
    			if (if_block6) if_block6.d();
    			if (bubble_end_slot) bubble_end_slot.d(detaching);
    			if (default_slot) default_slot.d(detaching);
    			if (if_block7) if_block7.d();
    			if (content_end_slot) content_end_slot.d(detaching);
    			if (end_slot) end_slot.d(detaching);
    			run_all(dispose);
    		}
    	};
    }

    function instance$6($$self, $$props, $$invalidate) {
    	const omit_props_names = [
    		"class","text","htmlText","name","avatar","type","image","header","footer","textHeader","textFooter","first","last","tail","sameName","sameHeader","sameFooter","sameAvatar","typing"
    	];

    	let $$restProps = compute_rest_props($$props, omit_props_names);
    	const dispatch = createEventDispatcher();
    	let { class: className = undefined } = $$props;
    	let { text = undefined } = $$props;
    	let { htmlText = undefined } = $$props;
    	let { name = undefined } = $$props;
    	let { avatar = undefined } = $$props;
    	let { type = "sent" } = $$props;
    	let { image = undefined } = $$props;
    	let { header = undefined } = $$props;
    	let { footer = undefined } = $$props;
    	let { textHeader = undefined } = $$props;
    	let { textFooter = undefined } = $$props;
    	let { first = undefined } = $$props;
    	let { last = undefined } = $$props;
    	let { tail = undefined } = $$props;
    	let { sameName = undefined } = $$props;
    	let { sameHeader = undefined } = $$props;
    	let { sameFooter = undefined } = $$props;
    	let { sameAvatar = undefined } = $$props;
    	let { typing = undefined } = $$props;

    	function onClick() {
    		dispatch("click");
    		if (typeof $$props.onClick === "function") $$props.onClick();
    	}

    	function onNameClick() {
    		dispatch("clickName");
    		if (typeof $$props.onClickName === "function") $$props.onClickName();
    	}

    	function onTextClick() {
    		dispatch("clickText");
    		if (typeof $$props.onClickText === "function") $$props.onClickText();
    	}

    	function onAvatarClick() {
    		dispatch("clickAvatar");
    		if (typeof $$props.onClickAvatar === "function") $$props.onClickAvatar();
    	}

    	function onHeaderClick() {
    		dispatch("clickHeader");
    		if (typeof $$props.onClickHeader === "function") $$props.onClickHeader();
    	}

    	function onFooterClick() {
    		dispatch("clickFooter");
    		if (typeof $$props.onClickFooter === "function") $$props.onClickFooter();
    	}

    	function onBubbleClick() {
    		dispatch("clickBubble");
    		if (typeof $$props.onClickBubble === "function") $$props.onClickBubble();
    	}

    	let { $$slots = {}, $$scope } = $$props;

    	$$self.$set = $$new_props => {
    		$$invalidate(37, $$props = assign(assign({}, $$props), exclude_internal_props($$new_props)));
    		$$invalidate(26, $$restProps = compute_rest_props($$props, omit_props_names));
    		if ("class" in $$new_props) $$invalidate(27, className = $$new_props.class);
    		if ("text" in $$new_props) $$invalidate(0, text = $$new_props.text);
    		if ("htmlText" in $$new_props) $$invalidate(1, htmlText = $$new_props.htmlText);
    		if ("name" in $$new_props) $$invalidate(2, name = $$new_props.name);
    		if ("avatar" in $$new_props) $$invalidate(3, avatar = $$new_props.avatar);
    		if ("type" in $$new_props) $$invalidate(28, type = $$new_props.type);
    		if ("image" in $$new_props) $$invalidate(4, image = $$new_props.image);
    		if ("header" in $$new_props) $$invalidate(5, header = $$new_props.header);
    		if ("footer" in $$new_props) $$invalidate(6, footer = $$new_props.footer);
    		if ("textHeader" in $$new_props) $$invalidate(7, textHeader = $$new_props.textHeader);
    		if ("textFooter" in $$new_props) $$invalidate(8, textFooter = $$new_props.textFooter);
    		if ("first" in $$new_props) $$invalidate(29, first = $$new_props.first);
    		if ("last" in $$new_props) $$invalidate(30, last = $$new_props.last);
    		if ("tail" in $$new_props) $$invalidate(31, tail = $$new_props.tail);
    		if ("sameName" in $$new_props) $$invalidate(32, sameName = $$new_props.sameName);
    		if ("sameHeader" in $$new_props) $$invalidate(33, sameHeader = $$new_props.sameHeader);
    		if ("sameFooter" in $$new_props) $$invalidate(34, sameFooter = $$new_props.sameFooter);
    		if ("sameAvatar" in $$new_props) $$invalidate(35, sameAvatar = $$new_props.sameAvatar);
    		if ("typing" in $$new_props) $$invalidate(9, typing = $$new_props.typing);
    		if ("$$scope" in $$new_props) $$invalidate(38, $$scope = $$new_props.$$scope);
    	};

    	let classes;
    	let hasAvatarSlots;
    	let hasNameSlots;
    	let hasHeaderSlots;
    	let hasImageSlots;
    	let hasTextHeaderSlots;
    	let hasTextFooterSlots;
    	let hasTextSlots;
    	let hasFooterSlots;

    	$$self.$$.update = () => {
    		 $$invalidate(10, classes = Utils.classNames(
    			className,
    			"message",
    			{
    				"message-sent": type === "sent" || !type,
    				"message-received": type === "received",
    				"message-typing": typing,
    				"message-first": first,
    				"message-last": last,
    				"message-tail": tail,
    				"message-same-name": sameName,
    				"message-same-header": sameHeader,
    				"message-same-footer": sameFooter,
    				"message-same-avatar": sameAvatar
    			},
    			Mixins.colorClasses($$props)
    		));
    	};

    	 $$invalidate(11, hasAvatarSlots = hasSlots(arguments, "avatar"));
    	 $$invalidate(12, hasNameSlots = hasSlots(arguments, "name"));
    	 $$invalidate(13, hasHeaderSlots = hasSlots(arguments, "header"));
    	 $$invalidate(14, hasImageSlots = hasSlots(arguments, "image"));
    	 $$invalidate(15, hasTextHeaderSlots = hasSlots(arguments, "text-header"));
    	 $$invalidate(16, hasTextFooterSlots = hasSlots(arguments, "text-footer"));
    	 $$invalidate(17, hasTextSlots = hasSlots(arguments, "text"));
    	 $$invalidate(18, hasFooterSlots = hasSlots(arguments, "footer"));
    	$$props = exclude_internal_props($$props);

    	return [
    		text,
    		htmlText,
    		name,
    		avatar,
    		image,
    		header,
    		footer,
    		textHeader,
    		textFooter,
    		typing,
    		classes,
    		hasAvatarSlots,
    		hasNameSlots,
    		hasHeaderSlots,
    		hasImageSlots,
    		hasTextHeaderSlots,
    		hasTextFooterSlots,
    		hasTextSlots,
    		hasFooterSlots,
    		onClick,
    		onNameClick,
    		onTextClick,
    		onAvatarClick,
    		onHeaderClick,
    		onFooterClick,
    		onBubbleClick,
    		$$restProps,
    		className,
    		type,
    		first,
    		last,
    		tail,
    		sameName,
    		sameHeader,
    		sameFooter,
    		sameAvatar,
    		dispatch,
    		$$props,
    		$$scope,
    		$$slots
    	];
    }

    class Message extends SvelteComponent {
    	constructor(options) {
    		super();

    		init(
    			this,
    			options,
    			instance$6,
    			create_fragment$9,
    			safe_not_equal,
    			{
    				class: 27,
    				text: 0,
    				htmlText: 1,
    				name: 2,
    				avatar: 3,
    				type: 28,
    				image: 4,
    				header: 5,
    				footer: 6,
    				textHeader: 7,
    				textFooter: 8,
    				first: 29,
    				last: 30,
    				tail: 31,
    				sameName: 32,
    				sameHeader: 33,
    				sameFooter: 34,
    				sameAvatar: 35,
    				typing: 9
    			},
    			[-1, -1]
    		);
    	}
    }

    /* public/packages/svelte/components/messagebar-attachment.svelte generated by Svelte v3.22.3 */

    function create_if_block_1$3(ctx) {
    	let img;
    	let img_src_value;

    	return {
    		c() {
    			img = element("img");
    			if (img.src !== (img_src_value = /*image*/ ctx[0])) attr(img, "src", img_src_value);
    		},
    		m(target, anchor) {
    			insert(target, img, anchor);
    		},
    		p(ctx, dirty) {
    			if (dirty & /*image*/ 1 && img.src !== (img_src_value = /*image*/ ctx[0])) {
    				attr(img, "src", img_src_value);
    			}
    		},
    		d(detaching) {
    			if (detaching) detach(img);
    		}
    	};
    }

    // (36:2) {#if deletable}
    function create_if_block$4(ctx) {
    	let span;
    	let dispose;

    	return {
    		c() {
    			span = element("span");
    			attr(span, "class", "messagebar-attachment-delete");
    		},
    		m(target, anchor, remount) {
    			insert(target, span, anchor);
    			if (remount) dispose();
    			dispose = listen(span, "click", /*onDeleteClick*/ ctx[4]);
    		},
    		p: noop,
    		d(detaching) {
    			if (detaching) detach(span);
    			dispose();
    		}
    	};
    }

    function create_fragment$a(ctx) {
    	let div;
    	let t0;
    	let t1;
    	let current;
    	let dispose;
    	let if_block0 = /*image*/ ctx[0] && create_if_block_1$3(ctx);
    	let if_block1 = /*deletable*/ ctx[1] && create_if_block$4(ctx);
    	const default_slot_template = /*$$slots*/ ctx[10].default;
    	const default_slot = create_slot(default_slot_template, ctx, /*$$scope*/ ctx[9], null);
    	let div_levels = [{ class: /*classes*/ ctx[2] }, restProps(/*$$restProps*/ ctx[5])];
    	let div_data = {};

    	for (let i = 0; i < div_levels.length; i += 1) {
    		div_data = assign(div_data, div_levels[i]);
    	}

    	return {
    		c() {
    			div = element("div");
    			if (if_block0) if_block0.c();
    			t0 = space();
    			if (if_block1) if_block1.c();
    			t1 = space();
    			if (default_slot) default_slot.c();
    			set_attributes(div, div_data);
    		},
    		m(target, anchor, remount) {
    			insert(target, div, anchor);
    			if (if_block0) if_block0.m(div, null);
    			append(div, t0);
    			if (if_block1) if_block1.m(div, null);
    			append(div, t1);

    			if (default_slot) {
    				default_slot.m(div, null);
    			}

    			current = true;
    			if (remount) dispose();
    			dispose = listen(div, "click", /*onClick*/ ctx[3]);
    		},
    		p(ctx, [dirty]) {
    			if (/*image*/ ctx[0]) {
    				if (if_block0) {
    					if_block0.p(ctx, dirty);
    				} else {
    					if_block0 = create_if_block_1$3(ctx);
    					if_block0.c();
    					if_block0.m(div, t0);
    				}
    			} else if (if_block0) {
    				if_block0.d(1);
    				if_block0 = null;
    			}

    			if (/*deletable*/ ctx[1]) {
    				if (if_block1) {
    					if_block1.p(ctx, dirty);
    				} else {
    					if_block1 = create_if_block$4(ctx);
    					if_block1.c();
    					if_block1.m(div, t1);
    				}
    			} else if (if_block1) {
    				if_block1.d(1);
    				if_block1 = null;
    			}

    			if (default_slot) {
    				if (default_slot.p && dirty & /*$$scope*/ 512) {
    					default_slot.p(get_slot_context(default_slot_template, ctx, /*$$scope*/ ctx[9], null), get_slot_changes(default_slot_template, /*$$scope*/ ctx[9], dirty, null));
    				}
    			}

    			set_attributes(div, get_spread_update(div_levels, [
    				dirty & /*classes*/ 4 && { class: /*classes*/ ctx[2] },
    				dirty & /*restProps, $$restProps*/ 32 && restProps(/*$$restProps*/ ctx[5])
    			]));
    		},
    		i(local) {
    			if (current) return;
    			transition_in(default_slot, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(default_slot, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(div);
    			if (if_block0) if_block0.d();
    			if (if_block1) if_block1.d();
    			if (default_slot) default_slot.d(detaching);
    			dispose();
    		}
    	};
    }

    function instance$7($$self, $$props, $$invalidate) {
    	const omit_props_names = ["class","image","deletable"];
    	let $$restProps = compute_rest_props($$props, omit_props_names);
    	const dispatch = createEventDispatcher();
    	let { class: className = undefined } = $$props;
    	let { image = undefined } = $$props;
    	let { deletable = true } = $$props;

    	function onClick(event) {
    		dispatch("attachmentClick", [event]);
    		if (typeof $$props.onAttachmentClick === "function") $$props.onAttachmentClick(event);
    	}

    	function onDeleteClick(event) {
    		dispatch("attachmentDelete", [event]);
    		if (typeof $$props.onAttachmentDelete === "function") $$props.onAttachmentDelete(event);
    	}

    	let { $$slots = {}, $$scope } = $$props;

    	$$self.$set = $$new_props => {
    		$$invalidate(8, $$props = assign(assign({}, $$props), exclude_internal_props($$new_props)));
    		$$invalidate(5, $$restProps = compute_rest_props($$props, omit_props_names));
    		if ("class" in $$new_props) $$invalidate(6, className = $$new_props.class);
    		if ("image" in $$new_props) $$invalidate(0, image = $$new_props.image);
    		if ("deletable" in $$new_props) $$invalidate(1, deletable = $$new_props.deletable);
    		if ("$$scope" in $$new_props) $$invalidate(9, $$scope = $$new_props.$$scope);
    	};

    	let classes;

    	$$self.$$.update = () => {
    		 $$invalidate(2, classes = Utils.classNames(className, "messagebar-attachment", Mixins.colorClasses($$props)));
    	};

    	$$props = exclude_internal_props($$props);

    	return [
    		image,
    		deletable,
    		classes,
    		onClick,
    		onDeleteClick,
    		$$restProps,
    		className,
    		dispatch,
    		$$props,
    		$$scope,
    		$$slots
    	];
    }

    class Messagebar_attachment extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance$7, create_fragment$a, safe_not_equal, { class: 6, image: 0, deletable: 1 });
    	}
    }

    /* public/packages/svelte/components/messagebar-attachments.svelte generated by Svelte v3.22.3 */

    function create_fragment$b(ctx) {
    	let div;
    	let current;
    	const default_slot_template = /*$$slots*/ ctx[5].default;
    	const default_slot = create_slot(default_slot_template, ctx, /*$$scope*/ ctx[4], null);
    	let div_levels = [{ class: /*classes*/ ctx[0] }, restProps(/*$$restProps*/ ctx[1])];
    	let div_data = {};

    	for (let i = 0; i < div_levels.length; i += 1) {
    		div_data = assign(div_data, div_levels[i]);
    	}

    	return {
    		c() {
    			div = element("div");
    			if (default_slot) default_slot.c();
    			set_attributes(div, div_data);
    		},
    		m(target, anchor) {
    			insert(target, div, anchor);

    			if (default_slot) {
    				default_slot.m(div, null);
    			}

    			current = true;
    		},
    		p(ctx, [dirty]) {
    			if (default_slot) {
    				if (default_slot.p && dirty & /*$$scope*/ 16) {
    					default_slot.p(get_slot_context(default_slot_template, ctx, /*$$scope*/ ctx[4], null), get_slot_changes(default_slot_template, /*$$scope*/ ctx[4], dirty, null));
    				}
    			}

    			set_attributes(div, get_spread_update(div_levels, [
    				dirty & /*classes*/ 1 && { class: /*classes*/ ctx[0] },
    				dirty & /*restProps, $$restProps*/ 2 && restProps(/*$$restProps*/ ctx[1])
    			]));
    		},
    		i(local) {
    			if (current) return;
    			transition_in(default_slot, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(default_slot, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(div);
    			if (default_slot) default_slot.d(detaching);
    		}
    	};
    }

    function instance$8($$self, $$props, $$invalidate) {
    	const omit_props_names = ["class"];
    	let $$restProps = compute_rest_props($$props, omit_props_names);
    	let { class: className = undefined } = $$props;
    	let { $$slots = {}, $$scope } = $$props;

    	$$self.$set = $$new_props => {
    		$$invalidate(3, $$props = assign(assign({}, $$props), exclude_internal_props($$new_props)));
    		$$invalidate(1, $$restProps = compute_rest_props($$props, omit_props_names));
    		if ("class" in $$new_props) $$invalidate(2, className = $$new_props.class);
    		if ("$$scope" in $$new_props) $$invalidate(4, $$scope = $$new_props.$$scope);
    	};

    	let classes;

    	$$self.$$.update = () => {
    		 $$invalidate(0, classes = Utils.classNames(className, "messagebar-attachments", Mixins.colorClasses($$props)));
    	};

    	$$props = exclude_internal_props($$props);
    	return [classes, $$restProps, className, $$props, $$scope, $$slots];
    }

    class Messagebar_attachments extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance$8, create_fragment$b, safe_not_equal, { class: 2 });
    	}
    }

    /* public/packages/svelte/components/messagebar-sheet-image.svelte generated by Svelte v3.22.3 */

    function create_fragment$c(ctx) {
    	let label;
    	let input;
    	let t0;
    	let i;
    	let t1;
    	let current;
    	let dispose;
    	const default_slot_template = /*$$slots*/ ctx[11].default;
    	const default_slot = create_slot(default_slot_template, ctx, /*$$scope*/ ctx[10], null);
    	let label_levels = [{ class: /*classes*/ ctx[1] }, restProps(/*$$restProps*/ ctx[3])];
    	let label_data = {};

    	for (let i = 0; i < label_levels.length; i += 1) {
    		label_data = assign(label_data, label_levels[i]);
    	}

    	return {
    		c() {
    			label = element("label");
    			input = element("input");
    			t0 = space();
    			i = element("i");
    			t1 = space();
    			if (default_slot) default_slot.c();
    			attr(input, "type", "checkbox");
    			input.checked = /*checked*/ ctx[0];
    			attr(i, "class", "icon icon-checkbox");
    			set_attributes(label, label_data);
    		},
    		m(target, anchor, remount) {
    			insert(target, label, anchor);
    			append(label, input);
    			append(label, t0);
    			append(label, i);
    			append(label, t1);

    			if (default_slot) {
    				default_slot.m(label, null);
    			}

    			current = true;
    			if (remount) dispose();
    			dispose = listen(input, "change", /*onChange*/ ctx[2]);
    		},
    		p(ctx, [dirty]) {
    			if (!current || dirty & /*checked*/ 1) {
    				input.checked = /*checked*/ ctx[0];
    			}

    			if (default_slot) {
    				if (default_slot.p && dirty & /*$$scope*/ 1024) {
    					default_slot.p(get_slot_context(default_slot_template, ctx, /*$$scope*/ ctx[10], null), get_slot_changes(default_slot_template, /*$$scope*/ ctx[10], dirty, null));
    				}
    			}

    			set_attributes(label, get_spread_update(label_levels, [
    				dirty & /*classes*/ 2 && { class: /*classes*/ ctx[1] },
    				dirty & /*restProps, $$restProps*/ 8 && restProps(/*$$restProps*/ ctx[3])
    			]));
    		},
    		i(local) {
    			if (current) return;
    			transition_in(default_slot, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(default_slot, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(label);
    			if (default_slot) default_slot.d(detaching);
    			dispose();
    		}
    	};
    }

    function instance$9($$self, $$props, $$invalidate) {
    	const omit_props_names = ["style","class","image","checked"];
    	let $$restProps = compute_rest_props($$props, omit_props_names);
    	const dispatch = createEventDispatcher();
    	let { style = undefined } = $$props;
    	let { class: className = undefined } = $$props;
    	let { image = undefined } = $$props;
    	let { checked = false } = $$props;

    	function onChange(event) {
    		if (checked) dispatch("checked", [event]);
    		if (typeof $$props.onChecked === "function") $$props.onChecked(event); else dispatch("unchecked", [event]);
    		if (typeof $$props.onUnchecked === "function") $$props.onUnchecked(event);
    		dispatch("change", [event]);
    		if (typeof $$props.onChange === "function") $$props.onChange(event);
    	}

    	let { $$slots = {}, $$scope } = $$props;

    	$$self.$set = $$new_props => {
    		$$invalidate(9, $$props = assign(assign({}, $$props), exclude_internal_props($$new_props)));
    		$$invalidate(3, $$restProps = compute_rest_props($$props, omit_props_names));
    		if ("style" in $$new_props) $$invalidate(4, style = $$new_props.style);
    		if ("class" in $$new_props) $$invalidate(5, className = $$new_props.class);
    		if ("image" in $$new_props) $$invalidate(6, image = $$new_props.image);
    		if ("checked" in $$new_props) $$invalidate(0, checked = $$new_props.checked);
    		if ("$$scope" in $$new_props) $$invalidate(10, $$scope = $$new_props.$$scope);
    	};

    	let classes;
    	let styles;

    	$$self.$$.update = () => {
    		 $$invalidate(1, classes = Utils.classNames(className, "messagebar-sheet-image", "checkbox", Mixins.colorClasses($$props)));

    		if ($$self.$$.dirty & /*image, style*/ 80) {
    			 styles = `${image ? `background-image: url(${image});` : ""}${style || ""}`;
    		}
    	};

    	$$props = exclude_internal_props($$props);

    	return [
    		checked,
    		classes,
    		onChange,
    		$$restProps,
    		style,
    		className,
    		image,
    		styles,
    		dispatch,
    		$$props,
    		$$scope,
    		$$slots
    	];
    }

    class Messagebar_sheet_image extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance$9, create_fragment$c, safe_not_equal, { style: 4, class: 5, image: 6, checked: 0 });
    	}
    }

    /* public/packages/svelte/components/messagebar-sheet.svelte generated by Svelte v3.22.3 */

    function create_fragment$d(ctx) {
    	let div;
    	let current;
    	const default_slot_template = /*$$slots*/ ctx[5].default;
    	const default_slot = create_slot(default_slot_template, ctx, /*$$scope*/ ctx[4], null);
    	let div_levels = [{ class: /*classes*/ ctx[0] }, restProps(/*$$restProps*/ ctx[1])];
    	let div_data = {};

    	for (let i = 0; i < div_levels.length; i += 1) {
    		div_data = assign(div_data, div_levels[i]);
    	}

    	return {
    		c() {
    			div = element("div");
    			if (default_slot) default_slot.c();
    			set_attributes(div, div_data);
    		},
    		m(target, anchor) {
    			insert(target, div, anchor);

    			if (default_slot) {
    				default_slot.m(div, null);
    			}

    			current = true;
    		},
    		p(ctx, [dirty]) {
    			if (default_slot) {
    				if (default_slot.p && dirty & /*$$scope*/ 16) {
    					default_slot.p(get_slot_context(default_slot_template, ctx, /*$$scope*/ ctx[4], null), get_slot_changes(default_slot_template, /*$$scope*/ ctx[4], dirty, null));
    				}
    			}

    			set_attributes(div, get_spread_update(div_levels, [
    				dirty & /*classes*/ 1 && { class: /*classes*/ ctx[0] },
    				dirty & /*restProps, $$restProps*/ 2 && restProps(/*$$restProps*/ ctx[1])
    			]));
    		},
    		i(local) {
    			if (current) return;
    			transition_in(default_slot, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(default_slot, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(div);
    			if (default_slot) default_slot.d(detaching);
    		}
    	};
    }

    function instance$a($$self, $$props, $$invalidate) {
    	const omit_props_names = ["class"];
    	let $$restProps = compute_rest_props($$props, omit_props_names);
    	let { class: className = undefined } = $$props;
    	let { $$slots = {}, $$scope } = $$props;

    	$$self.$set = $$new_props => {
    		$$invalidate(3, $$props = assign(assign({}, $$props), exclude_internal_props($$new_props)));
    		$$invalidate(1, $$restProps = compute_rest_props($$props, omit_props_names));
    		if ("class" in $$new_props) $$invalidate(2, className = $$new_props.class);
    		if ("$$scope" in $$new_props) $$invalidate(4, $$scope = $$new_props.$$scope);
    	};

    	let classes;

    	$$self.$$.update = () => {
    		 $$invalidate(0, classes = Utils.classNames(className, "messagebar-sheet", Mixins.colorClasses($$props)));
    	};

    	$$props = exclude_internal_props($$props);
    	return [classes, $$restProps, className, $$props, $$scope, $$slots];
    }

    class Messagebar_sheet extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance$a, create_fragment$d, safe_not_equal, { class: 2 });
    	}
    }

    /* public/packages/svelte/components/messagebar.svelte generated by Svelte v3.22.3 */
    const get_after_inner_slot_changes_1 = dirty => ({});
    const get_after_inner_slot_context_1 = ctx => ({});
    const get_inner_end_slot_changes = dirty => ({});
    const get_inner_end_slot_context = ctx => ({});
    const get_send_link_slot_changes = dirty => ({});
    const get_send_link_slot_context = ctx => ({});
    const get_after_inner_slot_changes = dirty => ({});
    const get_after_inner_slot_context = ctx => ({});
    const get_before_area_slot_changes = dirty => ({});
    const get_before_area_slot_context = ctx => ({});
    const get_inner_start_slot_changes = dirty => ({});
    const get_inner_start_slot_context = ctx => ({});
    const get_before_inner_slot_changes = dirty => ({});
    const get_before_inner_slot_context = ctx => ({});

    // (234:4) {#if ((sendLink && sendLink.length > 0) || hasSendLinkSlots)}
    function create_if_block$5(ctx) {
    	let current;

    	const link = new Link({
    			props: {
    				onClick: /*onClick*/ ctx[16],
    				$$slots: { default: [create_default_slot$1] },
    				$$scope: { ctx }
    			}
    		});

    	return {
    		c() {
    			create_component(link.$$.fragment);
    		},
    		m(target, anchor) {
    			mount_component(link, target, anchor);
    			current = true;
    		},
    		p(ctx, dirty) {
    			const link_changes = {};

    			if (dirty[0] & /*sendLink*/ 2 | dirty[1] & /*$$scope*/ 131072) {
    				link_changes.$$scope = { dirty, ctx };
    			}

    			link.$set(link_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(link.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(link.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			destroy_component(link, detaching);
    		}
    	};
    }

    // (235:6) <Link onClick={onClick}>
    function create_default_slot$1(ctx) {
    	let t0;
    	let t1;
    	let current;
    	const send_link_slot_template = /*$$slots*/ ctx[46]["send-link"];
    	const send_link_slot = create_slot(send_link_slot_template, ctx, /*$$scope*/ ctx[48], get_send_link_slot_context);

    	return {
    		c() {
    			if (send_link_slot) send_link_slot.c();
    			t0 = space();
    			t1 = text(/*sendLink*/ ctx[1]);
    		},
    		m(target, anchor) {
    			if (send_link_slot) {
    				send_link_slot.m(target, anchor);
    			}

    			insert(target, t0, anchor);
    			insert(target, t1, anchor);
    			current = true;
    		},
    		p(ctx, dirty) {
    			if (send_link_slot) {
    				if (send_link_slot.p && dirty[1] & /*$$scope*/ 131072) {
    					send_link_slot.p(get_slot_context(send_link_slot_template, ctx, /*$$scope*/ ctx[48], get_send_link_slot_context), get_slot_changes(send_link_slot_template, /*$$scope*/ ctx[48], dirty, get_send_link_slot_changes));
    				}
    			}

    			if (!current || dirty[0] & /*sendLink*/ 2) set_data(t1, /*sendLink*/ ctx[1]);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(send_link_slot, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(send_link_slot, local);
    			current = false;
    		},
    		d(detaching) {
    			if (send_link_slot) send_link_slot.d(detaching);
    			if (detaching) detach(t0);
    			if (detaching) detach(t1);
    		}
    	};
    }

    function create_fragment$e(ctx) {
    	let div2;
    	let t0;
    	let div1;
    	let t1;
    	let div0;
    	let t2;
    	let t3;
    	let t4;
    	let t5;
    	let t6;
    	let t7;
    	let current;
    	const before_inner_slot_template = /*$$slots*/ ctx[46]["before-inner"];
    	const before_inner_slot = create_slot(before_inner_slot_template, ctx, /*$$scope*/ ctx[48], get_before_inner_slot_context);
    	const inner_start_slot_template = /*$$slots*/ ctx[46]["inner-start"];
    	const inner_start_slot = create_slot(inner_start_slot_template, ctx, /*$$scope*/ ctx[48], get_inner_start_slot_context);
    	const before_area_slot_template = /*$$slots*/ ctx[46]["before-area"];
    	const before_area_slot = create_slot(before_area_slot_template, ctx, /*$$scope*/ ctx[48], get_before_area_slot_context);

    	const input = new Input({
    			props: {
    				id: /*textareaId*/ ctx[5],
    				type: "textarea",
    				wrap: false,
    				placeholder: /*placeholder*/ ctx[7],
    				disabled: /*disabled*/ ctx[3],
    				name: /*name*/ ctx[6],
    				readonly: /*readonly*/ ctx[4],
    				resizable: /*resizable*/ ctx[0],
    				value: typeof /*value*/ ctx[2] === "undefined"
    				? ""
    				: /*value*/ ctx[2]
    			}
    		});

    	input.$on("input", /*onInput*/ ctx[13]);
    	input.$on("change", /*onChange*/ ctx[12]);
    	input.$on("focus", /*onFocus*/ ctx[14]);
    	input.$on("blur", /*onBlur*/ ctx[15]);
    	const after_inner_slot_template = /*$$slots*/ ctx[46]["after-inner"];
    	const after_inner_slot = create_slot(after_inner_slot_template, ctx, /*$$scope*/ ctx[48], get_after_inner_slot_context);
    	let if_block = (/*sendLink*/ ctx[1] && /*sendLink*/ ctx[1].length > 0 || /*hasSendLinkSlots*/ ctx[11]) && create_if_block$5(ctx);
    	const inner_end_slot_template = /*$$slots*/ ctx[46]["inner-end"];
    	const inner_end_slot = create_slot(inner_end_slot_template, ctx, /*$$scope*/ ctx[48], get_inner_end_slot_context);
    	const default_slot_template = /*$$slots*/ ctx[46].default;
    	const default_slot = create_slot(default_slot_template, ctx, /*$$scope*/ ctx[48], null);
    	const after_inner_slot_template_1 = /*$$slots*/ ctx[46]["after-inner"];
    	const after_inner_slot_1 = create_slot(after_inner_slot_template_1, ctx, /*$$scope*/ ctx[48], get_after_inner_slot_context_1);

    	let div2_levels = [
    		{ class: /*classes*/ ctx[10] },
    		{ "data-f7-slot": /*f7Slot*/ ctx[8] },
    		restProps(/*$$restProps*/ ctx[17])
    	];

    	let div2_data = {};

    	for (let i = 0; i < div2_levels.length; i += 1) {
    		div2_data = assign(div2_data, div2_levels[i]);
    	}

    	return {
    		c() {
    			div2 = element("div");
    			if (before_inner_slot) before_inner_slot.c();
    			t0 = space();
    			div1 = element("div");
    			if (inner_start_slot) inner_start_slot.c();
    			t1 = space();
    			div0 = element("div");
    			if (before_area_slot) before_area_slot.c();
    			t2 = space();
    			create_component(input.$$.fragment);
    			t3 = space();
    			if (after_inner_slot) after_inner_slot.c();
    			t4 = space();
    			if (if_block) if_block.c();
    			t5 = space();
    			if (inner_end_slot) inner_end_slot.c();
    			t6 = space();
    			if (default_slot) default_slot.c();
    			t7 = space();
    			if (after_inner_slot_1) after_inner_slot_1.c();
    			attr(div0, "class", "messagebar-area");
    			attr(div1, "class", "toolbar-inner");
    			set_attributes(div2, div2_data);
    		},
    		m(target, anchor) {
    			insert(target, div2, anchor);

    			if (before_inner_slot) {
    				before_inner_slot.m(div2, null);
    			}

    			append(div2, t0);
    			append(div2, div1);

    			if (inner_start_slot) {
    				inner_start_slot.m(div1, null);
    			}

    			append(div1, t1);
    			append(div1, div0);

    			if (before_area_slot) {
    				before_area_slot.m(div0, null);
    			}

    			append(div0, t2);
    			mount_component(input, div0, null);
    			append(div0, t3);

    			if (after_inner_slot) {
    				after_inner_slot.m(div0, null);
    			}

    			append(div1, t4);
    			if (if_block) if_block.m(div1, null);
    			append(div1, t5);

    			if (inner_end_slot) {
    				inner_end_slot.m(div1, null);
    			}

    			append(div1, t6);

    			if (default_slot) {
    				default_slot.m(div1, null);
    			}

    			append(div2, t7);

    			if (after_inner_slot_1) {
    				after_inner_slot_1.m(div2, null);
    			}

    			/*div2_binding*/ ctx[47](div2);
    			current = true;
    		},
    		p(ctx, dirty) {
    			if (before_inner_slot) {
    				if (before_inner_slot.p && dirty[1] & /*$$scope*/ 131072) {
    					before_inner_slot.p(get_slot_context(before_inner_slot_template, ctx, /*$$scope*/ ctx[48], get_before_inner_slot_context), get_slot_changes(before_inner_slot_template, /*$$scope*/ ctx[48], dirty, get_before_inner_slot_changes));
    				}
    			}

    			if (inner_start_slot) {
    				if (inner_start_slot.p && dirty[1] & /*$$scope*/ 131072) {
    					inner_start_slot.p(get_slot_context(inner_start_slot_template, ctx, /*$$scope*/ ctx[48], get_inner_start_slot_context), get_slot_changes(inner_start_slot_template, /*$$scope*/ ctx[48], dirty, get_inner_start_slot_changes));
    				}
    			}

    			if (before_area_slot) {
    				if (before_area_slot.p && dirty[1] & /*$$scope*/ 131072) {
    					before_area_slot.p(get_slot_context(before_area_slot_template, ctx, /*$$scope*/ ctx[48], get_before_area_slot_context), get_slot_changes(before_area_slot_template, /*$$scope*/ ctx[48], dirty, get_before_area_slot_changes));
    				}
    			}

    			const input_changes = {};
    			if (dirty[0] & /*textareaId*/ 32) input_changes.id = /*textareaId*/ ctx[5];
    			if (dirty[0] & /*placeholder*/ 128) input_changes.placeholder = /*placeholder*/ ctx[7];
    			if (dirty[0] & /*disabled*/ 8) input_changes.disabled = /*disabled*/ ctx[3];
    			if (dirty[0] & /*name*/ 64) input_changes.name = /*name*/ ctx[6];
    			if (dirty[0] & /*readonly*/ 16) input_changes.readonly = /*readonly*/ ctx[4];
    			if (dirty[0] & /*resizable*/ 1) input_changes.resizable = /*resizable*/ ctx[0];

    			if (dirty[0] & /*value*/ 4) input_changes.value = typeof /*value*/ ctx[2] === "undefined"
    			? ""
    			: /*value*/ ctx[2];

    			input.$set(input_changes);

    			if (after_inner_slot) {
    				if (after_inner_slot.p && dirty[1] & /*$$scope*/ 131072) {
    					after_inner_slot.p(get_slot_context(after_inner_slot_template, ctx, /*$$scope*/ ctx[48], get_after_inner_slot_context), get_slot_changes(after_inner_slot_template, /*$$scope*/ ctx[48], dirty, get_after_inner_slot_changes));
    				}
    			}

    			if (/*sendLink*/ ctx[1] && /*sendLink*/ ctx[1].length > 0 || /*hasSendLinkSlots*/ ctx[11]) {
    				if (if_block) {
    					if_block.p(ctx, dirty);

    					if (dirty[0] & /*sendLink, hasSendLinkSlots*/ 2050) {
    						transition_in(if_block, 1);
    					}
    				} else {
    					if_block = create_if_block$5(ctx);
    					if_block.c();
    					transition_in(if_block, 1);
    					if_block.m(div1, t5);
    				}
    			} else if (if_block) {
    				group_outros();

    				transition_out(if_block, 1, 1, () => {
    					if_block = null;
    				});

    				check_outros();
    			}

    			if (inner_end_slot) {
    				if (inner_end_slot.p && dirty[1] & /*$$scope*/ 131072) {
    					inner_end_slot.p(get_slot_context(inner_end_slot_template, ctx, /*$$scope*/ ctx[48], get_inner_end_slot_context), get_slot_changes(inner_end_slot_template, /*$$scope*/ ctx[48], dirty, get_inner_end_slot_changes));
    				}
    			}

    			if (default_slot) {
    				if (default_slot.p && dirty[1] & /*$$scope*/ 131072) {
    					default_slot.p(get_slot_context(default_slot_template, ctx, /*$$scope*/ ctx[48], null), get_slot_changes(default_slot_template, /*$$scope*/ ctx[48], dirty, null));
    				}
    			}

    			if (after_inner_slot_1) {
    				if (after_inner_slot_1.p && dirty[1] & /*$$scope*/ 131072) {
    					after_inner_slot_1.p(get_slot_context(after_inner_slot_template_1, ctx, /*$$scope*/ ctx[48], get_after_inner_slot_context_1), get_slot_changes(after_inner_slot_template_1, /*$$scope*/ ctx[48], dirty, get_after_inner_slot_changes_1));
    				}
    			}

    			set_attributes(div2, get_spread_update(div2_levels, [
    				dirty[0] & /*classes*/ 1024 && { class: /*classes*/ ctx[10] },
    				dirty[0] & /*f7Slot*/ 256 && { "data-f7-slot": /*f7Slot*/ ctx[8] },
    				dirty[0] & /*$$restProps*/ 131072 && restProps(/*$$restProps*/ ctx[17])
    			]));
    		},
    		i(local) {
    			if (current) return;
    			transition_in(before_inner_slot, local);
    			transition_in(inner_start_slot, local);
    			transition_in(before_area_slot, local);
    			transition_in(input.$$.fragment, local);
    			transition_in(after_inner_slot, local);
    			transition_in(if_block);
    			transition_in(inner_end_slot, local);
    			transition_in(default_slot, local);
    			transition_in(after_inner_slot_1, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(before_inner_slot, local);
    			transition_out(inner_start_slot, local);
    			transition_out(before_area_slot, local);
    			transition_out(input.$$.fragment, local);
    			transition_out(after_inner_slot, local);
    			transition_out(if_block);
    			transition_out(inner_end_slot, local);
    			transition_out(default_slot, local);
    			transition_out(after_inner_slot_1, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(div2);
    			if (before_inner_slot) before_inner_slot.d(detaching);
    			if (inner_start_slot) inner_start_slot.d(detaching);
    			if (before_area_slot) before_area_slot.d(detaching);
    			destroy_component(input);
    			if (after_inner_slot) after_inner_slot.d(detaching);
    			if (if_block) if_block.d();
    			if (inner_end_slot) inner_end_slot.d(detaching);
    			if (default_slot) default_slot.d(detaching);
    			if (after_inner_slot_1) after_inner_slot_1.d(detaching);
    			/*div2_binding*/ ctx[47](null);
    		}
    	};
    }

    function instance_1$3($$self, $$props, $$invalidate) {
    	const omit_props_names = [
    		"class","sheetVisible","attachmentsVisible","top","resizable","bottomOffset","topOffset","maxHeight","resizePage","sendLink","value","disabled","readonly","textareaId","name","placeholder","init","f7Slot","instance","clear","getValue","setValue","resize","focus","blur"
    	];

    	let $$restProps = compute_rest_props($$props, omit_props_names);
    	const dispatch = createEventDispatcher();
    	let { class: className = undefined } = $$props;
    	let { sheetVisible = false } = $$props;
    	let { attachmentsVisible = false } = $$props;
    	let { top = false } = $$props;
    	let { resizable = true } = $$props;
    	let { bottomOffset = 0 } = $$props;
    	let { topOffset = 0 } = $$props;
    	let { maxHeight = undefined } = $$props;
    	let { resizePage = true } = $$props;
    	let { sendLink = undefined } = $$props;
    	let { value = undefined } = $$props;
    	let { disabled = false } = $$props;
    	let { readonly = false } = $$props;
    	let { textareaId = undefined } = $$props;
    	let { name = undefined } = $$props;
    	let { placeholder = "Message" } = $$props;
    	let { init = true } = $$props;
    	let { f7Slot = "fixed" } = $$props;
    	let el;
    	let f7Messagebar;
    	let updateSheetVisible;
    	let updateAttachmentsVisible;

    	function instance() {
    		return f7Messagebar;
    	}

    	function clear(...args) {
    		if (!f7Messagebar) return undefined;
    		return f7Messagebar.clear(...args);
    	}

    	function getValue(...args) {
    		if (!f7Messagebar) return undefined;
    		return f7Messagebar.getValue(...args);
    	}

    	function setValue(...args) {
    		if (!f7Messagebar) return undefined;
    		return f7Messagebar.setValue(...args);
    	}

    	function resize(...args) {
    		if (!f7Messagebar) return undefined;
    		return f7Messagebar.resizePage(...args);
    	}

    	function focus(...args) {
    		if (!f7Messagebar) return undefined;
    		return f7Messagebar.focus(...args);
    	}

    	function blur(...args) {
    		if (!f7Messagebar) return undefined;
    		return f7Messagebar.blur(...args);
    	}

    	let initialWatchedSheet = false;

    	function watchSheetVisible() {
    		if (!initialWatchedSheet) {
    			initialWatchedSheet = true;
    			return;
    		}

    		if (!resizable || !f7Messagebar) return;
    		updateSheetVisible = true;
    	}

    	let initialWatchedAttachments;

    	function watchAttachmentsVisible() {
    		if (!initialWatchedAttachments) {
    			initialWatchedAttachments = true;
    			return;
    		}

    		if (!resizable || !f7Messagebar) return;
    		updateAttachmentsVisible = true;
    	}

    	function onChange(event) {
    		dispatch("change", [...event.detail]);
    		if (typeof $$props.onChange === "function") $$props.onChange(...event.detail);
    	}

    	function onInput(event) {
    		dispatch("input", [...event.detail]);
    		if (typeof $$props.onInput === "function") $$props.onInput(...event.detail);
    	}

    	function onFocus(event) {
    		dispatch("focus", [...event.detail]);
    		if (typeof $$props.onFocus === "function") $$props.onFocus(...event.detail);
    	}

    	function onBlur(event) {
    		dispatch("blur", [...event.detail]);
    		if (typeof $$props.onBlur === "function") $$props.onBlur(...event.detail);
    	}

    	function onClick(event) {
    		const inputValue = el.querySelector("textarea");

    		const clear = f7Messagebar
    		? () => {
    				f7Messagebar.clear();
    			}
    		: () => {
    				
    			};

    		dispatch("submit", [inputValue, clear]);
    		if (typeof $$props.onSubmit === "function") $$props.onSubmit(inputValue, clear);
    		dispatch("send", [inputValue, clear]);
    		if (typeof $$props.onSend === "function") $$props.onSend(inputValue, clear);
    		dispatch("click", [event]);
    		if (typeof $$props.onClick === "function") $$props.onClick(event);
    	}

    	function onAttachmentDelete(inst, attachmentEl, attachmentElIndex) {
    		dispatch("messagebarAttachmentDelete", [inst, attachmentEl, attachmentElIndex]);
    		if (typeof $$props.onMessagebarAttachmentDelete === "function") $$props.onMessagebarAttachmentDelete(inst, attachmentEl, attachmentElIndex);
    	}

    	function onAttachmentClick(inst, attachmentEl, attachmentElIndex) {
    		dispatch("messagebarAttachmentClick", [inst, attachmentEl, attachmentElIndex]);
    		if (typeof $$props.onMessagebarAttachmentClick === "function") $$props.onMessagebarAttachmentClick(inst, attachmentEl, attachmentElIndex);
    	}

    	function onResizePage(inst) {
    		dispatch("messagebarResizePage", [inst]);
    		if (typeof $$props.onMessagebarResizePage === "function") $$props.onMessagebarResizePage(inst);
    	}

    	onMount(() => {
    		if (!init || !el) return;

    		f7.ready(() => {
    			if (el) {
    				const dom7 = f7.instance.$;
    				const attachmentsEl = dom7(el).find(".toolbar-inner > .messagebar-attachments");
    				if (attachmentsEl.length) dom7(el).find(".messagebar-area").prepend(attachmentsEl);
    				const sheetEl = dom7(el).find(".toolbar-inner > .messagebar-sheet");
    				if (sheetEl.length) dom7(el).append(sheetEl);
    			}

    			f7Messagebar = f7.instance.messagebar.create(Utils.noUndefinedProps({
    				el,
    				top,
    				resizePage,
    				bottomOffset,
    				topOffset,
    				maxHeight,
    				on: {
    					attachmentDelete: onAttachmentDelete,
    					attachmentClick: onAttachmentClick,
    					resizePage: onResizePage
    				}
    			}));
    		});
    	});

    	afterUpdate(() => {
    		if (!f7Messagebar) return;

    		if (el && f7.instance) {
    			const dom7 = f7.instance.$;
    			const attachmentsEl = dom7(el).find(".toolbar-inner > .messagebar-attachments");
    			if (attachmentsEl.length) dom7(el).find(".messagebar-area").prepend(attachmentsEl);
    			const sheetEl = dom7(el).find(".toolbar-inner > .messagebar-sheet");
    			if (sheetEl.length) dom7(el).append(sheetEl);
    		}

    		if (updateSheetVisible) {
    			updateSheetVisible = false;
    			f7Messagebar.sheetVisible = sheetVisible;
    			f7Messagebar.resizePage();
    		}

    		if (updateAttachmentsVisible) {
    			updateAttachmentsVisible = false;
    			f7Messagebar.attachmentsVisible = attachmentsVisible;
    			f7Messagebar.resizePage();
    		}
    	});

    	onDestroy(() => {
    		if (f7Messagebar && f7Messagebar.destroy) f7Messagebar.destroy();
    	});

    	let { $$slots = {}, $$scope } = $$props;

    	function div2_binding($$value) {
    		binding_callbacks[$$value ? "unshift" : "push"](() => {
    			$$invalidate(9, el = $$value);
    		});
    	}

    	$$self.$set = $$new_props => {
    		$$invalidate(45, $$props = assign(assign({}, $$props), exclude_internal_props($$new_props)));
    		$$invalidate(17, $$restProps = compute_rest_props($$props, omit_props_names));
    		if ("class" in $$new_props) $$invalidate(18, className = $$new_props.class);
    		if ("sheetVisible" in $$new_props) $$invalidate(19, sheetVisible = $$new_props.sheetVisible);
    		if ("attachmentsVisible" in $$new_props) $$invalidate(20, attachmentsVisible = $$new_props.attachmentsVisible);
    		if ("top" in $$new_props) $$invalidate(21, top = $$new_props.top);
    		if ("resizable" in $$new_props) $$invalidate(0, resizable = $$new_props.resizable);
    		if ("bottomOffset" in $$new_props) $$invalidate(22, bottomOffset = $$new_props.bottomOffset);
    		if ("topOffset" in $$new_props) $$invalidate(23, topOffset = $$new_props.topOffset);
    		if ("maxHeight" in $$new_props) $$invalidate(24, maxHeight = $$new_props.maxHeight);
    		if ("resizePage" in $$new_props) $$invalidate(25, resizePage = $$new_props.resizePage);
    		if ("sendLink" in $$new_props) $$invalidate(1, sendLink = $$new_props.sendLink);
    		if ("value" in $$new_props) $$invalidate(2, value = $$new_props.value);
    		if ("disabled" in $$new_props) $$invalidate(3, disabled = $$new_props.disabled);
    		if ("readonly" in $$new_props) $$invalidate(4, readonly = $$new_props.readonly);
    		if ("textareaId" in $$new_props) $$invalidate(5, textareaId = $$new_props.textareaId);
    		if ("name" in $$new_props) $$invalidate(6, name = $$new_props.name);
    		if ("placeholder" in $$new_props) $$invalidate(7, placeholder = $$new_props.placeholder);
    		if ("init" in $$new_props) $$invalidate(26, init = $$new_props.init);
    		if ("f7Slot" in $$new_props) $$invalidate(8, f7Slot = $$new_props.f7Slot);
    		if ("$$scope" in $$new_props) $$invalidate(48, $$scope = $$new_props.$$scope);
    	};

    	let classes;
    	let hasSendLinkSlots;

    	$$self.$$.update = () => {
    		 $$invalidate(10, classes = Utils.classNames(
    			className,
    			"toolbar",
    			"messagebar",
    			{
    				"messagebar-attachments-visible": attachmentsVisible,
    				"messagebar-sheet-visible": sheetVisible
    			},
    			Mixins.colorClasses($$props)
    		));

    		if ($$self.$$.dirty[0] & /*sheetVisible*/ 524288) {
    			 watchSheetVisible();
    		}

    		if ($$self.$$.dirty[0] & /*attachmentsVisible*/ 1048576) {
    			 watchAttachmentsVisible();
    		}
    	};

    	 $$invalidate(11, hasSendLinkSlots = hasSlots(arguments, "send-link"));
    	$$props = exclude_internal_props($$props);

    	return [
    		resizable,
    		sendLink,
    		value,
    		disabled,
    		readonly,
    		textareaId,
    		name,
    		placeholder,
    		f7Slot,
    		el,
    		classes,
    		hasSendLinkSlots,
    		onChange,
    		onInput,
    		onFocus,
    		onBlur,
    		onClick,
    		$$restProps,
    		className,
    		sheetVisible,
    		attachmentsVisible,
    		top,
    		bottomOffset,
    		topOffset,
    		maxHeight,
    		resizePage,
    		init,
    		instance,
    		clear,
    		getValue,
    		setValue,
    		resize,
    		focus,
    		blur,
    		f7Messagebar,
    		updateSheetVisible,
    		updateAttachmentsVisible,
    		initialWatchedSheet,
    		initialWatchedAttachments,
    		dispatch,
    		watchSheetVisible,
    		watchAttachmentsVisible,
    		onAttachmentDelete,
    		onAttachmentClick,
    		onResizePage,
    		$$props,
    		$$slots,
    		div2_binding,
    		$$scope
    	];
    }

    class Messagebar extends SvelteComponent {
    	constructor(options) {
    		super();

    		init(
    			this,
    			options,
    			instance_1$3,
    			create_fragment$e,
    			safe_not_equal,
    			{
    				class: 18,
    				sheetVisible: 19,
    				attachmentsVisible: 20,
    				top: 21,
    				resizable: 0,
    				bottomOffset: 22,
    				topOffset: 23,
    				maxHeight: 24,
    				resizePage: 25,
    				sendLink: 1,
    				value: 2,
    				disabled: 3,
    				readonly: 4,
    				textareaId: 5,
    				name: 6,
    				placeholder: 7,
    				init: 26,
    				f7Slot: 8,
    				instance: 27,
    				clear: 28,
    				getValue: 29,
    				setValue: 30,
    				resize: 31,
    				focus: 32,
    				blur: 33
    			},
    			[-1, -1]
    		);
    	}

    	get instance() {
    		return this.$$.ctx[27];
    	}

    	get clear() {
    		return this.$$.ctx[28];
    	}

    	get getValue() {
    		return this.$$.ctx[29];
    	}

    	get setValue() {
    		return this.$$.ctx[30];
    	}

    	get resize() {
    		return this.$$.ctx[31];
    	}

    	get focus() {
    		return this.$$.ctx[32];
    	}

    	get blur() {
    		return this.$$.ctx[33];
    	}
    }

    /* public/packages/svelte/components/messages-title.svelte generated by Svelte v3.22.3 */

    function create_fragment$f(ctx) {
    	let div;
    	let current;
    	const default_slot_template = /*$$slots*/ ctx[5].default;
    	const default_slot = create_slot(default_slot_template, ctx, /*$$scope*/ ctx[4], null);
    	let div_levels = [{ class: /*classes*/ ctx[0] }, restProps(/*$$restProps*/ ctx[1])];
    	let div_data = {};

    	for (let i = 0; i < div_levels.length; i += 1) {
    		div_data = assign(div_data, div_levels[i]);
    	}

    	return {
    		c() {
    			div = element("div");
    			if (default_slot) default_slot.c();
    			set_attributes(div, div_data);
    		},
    		m(target, anchor) {
    			insert(target, div, anchor);

    			if (default_slot) {
    				default_slot.m(div, null);
    			}

    			current = true;
    		},
    		p(ctx, [dirty]) {
    			if (default_slot) {
    				if (default_slot.p && dirty & /*$$scope*/ 16) {
    					default_slot.p(get_slot_context(default_slot_template, ctx, /*$$scope*/ ctx[4], null), get_slot_changes(default_slot_template, /*$$scope*/ ctx[4], dirty, null));
    				}
    			}

    			set_attributes(div, get_spread_update(div_levels, [
    				dirty & /*classes*/ 1 && { class: /*classes*/ ctx[0] },
    				dirty & /*restProps, $$restProps*/ 2 && restProps(/*$$restProps*/ ctx[1])
    			]));
    		},
    		i(local) {
    			if (current) return;
    			transition_in(default_slot, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(default_slot, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(div);
    			if (default_slot) default_slot.d(detaching);
    		}
    	};
    }

    function instance$b($$self, $$props, $$invalidate) {
    	const omit_props_names = ["class"];
    	let $$restProps = compute_rest_props($$props, omit_props_names);
    	let { class: className = undefined } = $$props;
    	let { $$slots = {}, $$scope } = $$props;

    	$$self.$set = $$new_props => {
    		$$invalidate(3, $$props = assign(assign({}, $$props), exclude_internal_props($$new_props)));
    		$$invalidate(1, $$restProps = compute_rest_props($$props, omit_props_names));
    		if ("class" in $$new_props) $$invalidate(2, className = $$new_props.class);
    		if ("$$scope" in $$new_props) $$invalidate(4, $$scope = $$new_props.$$scope);
    	};

    	let classes;

    	$$self.$$.update = () => {
    		 $$invalidate(0, classes = Utils.classNames(className, "messages-title", Mixins.colorClasses($$props)));
    	};

    	$$props = exclude_internal_props($$props);
    	return [classes, $$restProps, className, $$props, $$scope, $$slots];
    }

    class Messages_title extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance$b, create_fragment$f, safe_not_equal, { class: 2 });
    	}
    }

    /* public/packages/svelte/components/messages.svelte generated by Svelte v3.22.3 */

    function create_fragment$g(ctx) {
    	let div;
    	let current;
    	const default_slot_template = /*$$slots*/ ctx[26].default;
    	const default_slot = create_slot(default_slot_template, ctx, /*$$scope*/ ctx[25], null);
    	let div_levels = [{ class: /*classes*/ ctx[1] }, restProps(/*$$restProps*/ ctx[2])];
    	let div_data = {};

    	for (let i = 0; i < div_levels.length; i += 1) {
    		div_data = assign(div_data, div_levels[i]);
    	}

    	return {
    		c() {
    			div = element("div");
    			if (default_slot) default_slot.c();
    			set_attributes(div, div_data);
    		},
    		m(target, anchor) {
    			insert(target, div, anchor);

    			if (default_slot) {
    				default_slot.m(div, null);
    			}

    			/*div_binding*/ ctx[27](div);
    			current = true;
    		},
    		p(ctx, [dirty]) {
    			if (default_slot) {
    				if (default_slot.p && dirty & /*$$scope*/ 33554432) {
    					default_slot.p(get_slot_context(default_slot_template, ctx, /*$$scope*/ ctx[25], null), get_slot_changes(default_slot_template, /*$$scope*/ ctx[25], dirty, null));
    				}
    			}

    			set_attributes(div, get_spread_update(div_levels, [
    				dirty & /*classes*/ 2 && { class: /*classes*/ ctx[1] },
    				dirty & /*restProps, $$restProps*/ 4 && restProps(/*$$restProps*/ ctx[2])
    			]));
    		},
    		i(local) {
    			if (current) return;
    			transition_in(default_slot, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(default_slot, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(div);
    			if (default_slot) default_slot.d(detaching);
    			/*div_binding*/ ctx[27](null);
    		}
    	};
    }

    function instance_1$4($$self, $$props, $$invalidate) {
    	const omit_props_names = [
    		"class","autoLayout","messages","newMessagesFirst","scrollMessages","scrollMessagesOnEdge","firstMessageRule","lastMessageRule","tailMessageRule","sameNameMessageRule","sameHeaderMessageRule","sameFooterMessageRule","sameAvatarMessageRule","customClassMessageRule","renderMessage","init","instance","scroll","showTyping","hideTyping"
    	];

    	let $$restProps = compute_rest_props($$props, omit_props_names);
    	let { class: className = undefined } = $$props;
    	let { autoLayout = false } = $$props;
    	let { messages = [] } = $$props;
    	let { newMessagesFirst = false } = $$props;
    	let { scrollMessages = true } = $$props;
    	let { scrollMessagesOnEdge = true } = $$props;
    	let { firstMessageRule = undefined } = $$props;
    	let { lastMessageRule = undefined } = $$props;
    	let { tailMessageRule = undefined } = $$props;
    	let { sameNameMessageRule = undefined } = $$props;
    	let { sameHeaderMessageRule = undefined } = $$props;
    	let { sameFooterMessageRule = undefined } = $$props;
    	let { sameAvatarMessageRule = undefined } = $$props;
    	let { customClassMessageRule = undefined } = $$props;
    	let { renderMessage = undefined } = $$props;
    	let { init = true } = $$props;
    	let el;
    	let f7Messages;

    	function instance() {
    		return f7Messages;
    	}

    	function scroll(duration, scrollTop) {
    		if (!f7Messages) return undefined;
    		return f7Messages.scroll(duration, scrollTop);
    	}

    	function showTyping(message) {
    		if (!f7Messages) return undefined;
    		return f7Messages.showTyping(message);
    	}

    	function hideTyping() {
    		if (!f7Messages) return undefined;
    		return f7Messages.hideTyping();
    	}

    	onMount(() => {
    		if (!init) return;

    		f7.ready(() => {
    			f7Messages = f7.instance.messages.create(Utils.noUndefinedProps({
    				el,
    				autoLayout,
    				messages,
    				newMessagesFirst,
    				scrollMessages,
    				scrollMessagesOnEdge,
    				firstMessageRule,
    				lastMessageRule,
    				tailMessageRule,
    				sameNameMessageRule,
    				sameHeaderMessageRule,
    				sameFooterMessageRule,
    				sameAvatarMessageRule,
    				customClassMessageRule,
    				renderMessage
    			}));
    		});
    	});

    	beforeUpdate(() => {
    		if (!init || !el) return;
    		const children = el.children;
    		if (!children) return;

    		for (let i = 0; i < children.length; i += 1) {
    			children[i].classList.add("message-appeared");
    		}
    	});

    	afterUpdate(() => {
    		if (!init) return;
    		if (!el) return;
    		const children = el.children;
    		if (!children) return;

    		for (let i = 0; i < children.length; i += 1) {
    			if (!children[i].classList.contains("message-appeared")) {
    				children[i].classList.add("message-appear-from-bottom");
    			}
    		}

    		if (f7Messages && f7Messages.layout && autoLayout) {
    			f7Messages.layout();
    		}

    		if (f7Messages && f7Messages.scroll && scrollMessages) {
    			f7Messages.scroll();
    		}
    	});

    	onDestroy(() => {
    		if (f7Messages && f7Messages.destroy) f7Messages.destroy();
    	});

    	let { $$slots = {}, $$scope } = $$props;

    	function div_binding($$value) {
    		binding_callbacks[$$value ? "unshift" : "push"](() => {
    			$$invalidate(0, el = $$value);
    		});
    	}

    	$$self.$set = $$new_props => {
    		$$invalidate(24, $$props = assign(assign({}, $$props), exclude_internal_props($$new_props)));
    		$$invalidate(2, $$restProps = compute_rest_props($$props, omit_props_names));
    		if ("class" in $$new_props) $$invalidate(3, className = $$new_props.class);
    		if ("autoLayout" in $$new_props) $$invalidate(4, autoLayout = $$new_props.autoLayout);
    		if ("messages" in $$new_props) $$invalidate(5, messages = $$new_props.messages);
    		if ("newMessagesFirst" in $$new_props) $$invalidate(6, newMessagesFirst = $$new_props.newMessagesFirst);
    		if ("scrollMessages" in $$new_props) $$invalidate(7, scrollMessages = $$new_props.scrollMessages);
    		if ("scrollMessagesOnEdge" in $$new_props) $$invalidate(8, scrollMessagesOnEdge = $$new_props.scrollMessagesOnEdge);
    		if ("firstMessageRule" in $$new_props) $$invalidate(9, firstMessageRule = $$new_props.firstMessageRule);
    		if ("lastMessageRule" in $$new_props) $$invalidate(10, lastMessageRule = $$new_props.lastMessageRule);
    		if ("tailMessageRule" in $$new_props) $$invalidate(11, tailMessageRule = $$new_props.tailMessageRule);
    		if ("sameNameMessageRule" in $$new_props) $$invalidate(12, sameNameMessageRule = $$new_props.sameNameMessageRule);
    		if ("sameHeaderMessageRule" in $$new_props) $$invalidate(13, sameHeaderMessageRule = $$new_props.sameHeaderMessageRule);
    		if ("sameFooterMessageRule" in $$new_props) $$invalidate(14, sameFooterMessageRule = $$new_props.sameFooterMessageRule);
    		if ("sameAvatarMessageRule" in $$new_props) $$invalidate(15, sameAvatarMessageRule = $$new_props.sameAvatarMessageRule);
    		if ("customClassMessageRule" in $$new_props) $$invalidate(16, customClassMessageRule = $$new_props.customClassMessageRule);
    		if ("renderMessage" in $$new_props) $$invalidate(17, renderMessage = $$new_props.renderMessage);
    		if ("init" in $$new_props) $$invalidate(18, init = $$new_props.init);
    		if ("$$scope" in $$new_props) $$invalidate(25, $$scope = $$new_props.$$scope);
    	};

    	let classes;

    	$$self.$$.update = () => {
    		 $$invalidate(1, classes = Utils.classNames(className, "messages", Mixins.colorClasses($$props)));
    	};

    	$$props = exclude_internal_props($$props);

    	return [
    		el,
    		classes,
    		$$restProps,
    		className,
    		autoLayout,
    		messages,
    		newMessagesFirst,
    		scrollMessages,
    		scrollMessagesOnEdge,
    		firstMessageRule,
    		lastMessageRule,
    		tailMessageRule,
    		sameNameMessageRule,
    		sameHeaderMessageRule,
    		sameFooterMessageRule,
    		sameAvatarMessageRule,
    		customClassMessageRule,
    		renderMessage,
    		init,
    		instance,
    		scroll,
    		showTyping,
    		hideTyping,
    		f7Messages,
    		$$props,
    		$$scope,
    		$$slots,
    		div_binding
    	];
    }

    class Messages extends SvelteComponent {
    	constructor(options) {
    		super();

    		init(this, options, instance_1$4, create_fragment$g, safe_not_equal, {
    			class: 3,
    			autoLayout: 4,
    			messages: 5,
    			newMessagesFirst: 6,
    			scrollMessages: 7,
    			scrollMessagesOnEdge: 8,
    			firstMessageRule: 9,
    			lastMessageRule: 10,
    			tailMessageRule: 11,
    			sameNameMessageRule: 12,
    			sameHeaderMessageRule: 13,
    			sameFooterMessageRule: 14,
    			sameAvatarMessageRule: 15,
    			customClassMessageRule: 16,
    			renderMessage: 17,
    			init: 18,
    			instance: 19,
    			scroll: 20,
    			showTyping: 21,
    			hideTyping: 22
    		});
    	}

    	get instance() {
    		return this.$$.ctx[19];
    	}

    	get scroll() {
    		return this.$$.ctx[20];
    	}

    	get showTyping() {
    		return this.$$.ctx[21];
    	}

    	get hideTyping() {
    		return this.$$.ctx[22];
    	}
    }

    /* public/packages/svelte/components/nav-left.svelte generated by Svelte v3.22.3 */

    function create_if_block$6(ctx) {
    	let current;

    	const link = new Link({
    			props: {
    				href: /*backLinkUrl*/ ctx[1] || "#",
    				back: true,
    				icon: "icon-back",
    				force: /*backLinkForce*/ ctx[2] || undefined,
    				class: !/*backLinkText*/ ctx[4] ? "icon-only" : undefined,
    				text: /*backLinkText*/ ctx[4],
    				onClick: /*onBackClick*/ ctx[5]
    			}
    		});

    	return {
    		c() {
    			create_component(link.$$.fragment);
    		},
    		m(target, anchor) {
    			mount_component(link, target, anchor);
    			current = true;
    		},
    		p(ctx, dirty) {
    			const link_changes = {};
    			if (dirty & /*backLinkUrl*/ 2) link_changes.href = /*backLinkUrl*/ ctx[1] || "#";
    			if (dirty & /*backLinkForce*/ 4) link_changes.force = /*backLinkForce*/ ctx[2] || undefined;
    			if (dirty & /*backLinkText*/ 16) link_changes.class = !/*backLinkText*/ ctx[4] ? "icon-only" : undefined;
    			if (dirty & /*backLinkText*/ 16) link_changes.text = /*backLinkText*/ ctx[4];
    			link.$set(link_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(link.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(link.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			destroy_component(link, detaching);
    		}
    	};
    }

    function create_fragment$h(ctx) {
    	let div;
    	let t;
    	let current;
    	let if_block = /*backLink*/ ctx[0] && create_if_block$6(ctx);
    	const default_slot_template = /*$$slots*/ ctx[15].default;
    	const default_slot = create_slot(default_slot_template, ctx, /*$$scope*/ ctx[14], null);
    	let div_levels = [{ class: /*classes*/ ctx[3] }, restProps(/*$$restProps*/ ctx[6])];
    	let div_data = {};

    	for (let i = 0; i < div_levels.length; i += 1) {
    		div_data = assign(div_data, div_levels[i]);
    	}

    	return {
    		c() {
    			div = element("div");
    			if (if_block) if_block.c();
    			t = space();
    			if (default_slot) default_slot.c();
    			set_attributes(div, div_data);
    		},
    		m(target, anchor) {
    			insert(target, div, anchor);
    			if (if_block) if_block.m(div, null);
    			append(div, t);

    			if (default_slot) {
    				default_slot.m(div, null);
    			}

    			current = true;
    		},
    		p(ctx, [dirty]) {
    			if (/*backLink*/ ctx[0]) {
    				if (if_block) {
    					if_block.p(ctx, dirty);

    					if (dirty & /*backLink*/ 1) {
    						transition_in(if_block, 1);
    					}
    				} else {
    					if_block = create_if_block$6(ctx);
    					if_block.c();
    					transition_in(if_block, 1);
    					if_block.m(div, t);
    				}
    			} else if (if_block) {
    				group_outros();

    				transition_out(if_block, 1, 1, () => {
    					if_block = null;
    				});

    				check_outros();
    			}

    			if (default_slot) {
    				if (default_slot.p && dirty & /*$$scope*/ 16384) {
    					default_slot.p(get_slot_context(default_slot_template, ctx, /*$$scope*/ ctx[14], null), get_slot_changes(default_slot_template, /*$$scope*/ ctx[14], dirty, null));
    				}
    			}

    			set_attributes(div, get_spread_update(div_levels, [
    				dirty & /*classes*/ 8 && { class: /*classes*/ ctx[3] },
    				dirty & /*restProps, $$restProps*/ 64 && restProps(/*$$restProps*/ ctx[6])
    			]));
    		},
    		i(local) {
    			if (current) return;
    			transition_in(if_block);
    			transition_in(default_slot, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(if_block);
    			transition_out(default_slot, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(div);
    			if (if_block) if_block.d();
    			if (default_slot) default_slot.d(detaching);
    		}
    	};
    }

    function instance$c($$self, $$props, $$invalidate) {
    	const omit_props_names = ["class","backLink","backLinkUrl","backLinkForce","backLinkShowText","sliding"];
    	let $$restProps = compute_rest_props($$props, omit_props_names);
    	const dispatch = createEventDispatcher();
    	let { class: className = undefined } = $$props;
    	let { backLink = undefined } = $$props;
    	let { backLinkUrl = undefined } = $$props;
    	let { backLinkForce = undefined } = $$props;
    	let { backLinkShowText = undefined } = $$props;
    	let { sliding = undefined } = $$props;

    	// eslint-disable-next-line
    	let _theme = f7.instance ? f7Theme : null;

    	if (!f7.instance) {
    		f7.ready(() => {
    			$$invalidate(10, _theme = f7Theme);
    		});
    	}

    	function onBackClick() {
    		dispatch("clickBack");
    		if (typeof $$props.onClickBack === "function") $$props.onClickBack();
    		dispatch("backClick");
    		if (typeof $$props.onBackClick === "function") $$props.onBackClick();
    	}

    	let { $$slots = {}, $$scope } = $$props;

    	$$self.$set = $$new_props => {
    		$$invalidate(13, $$props = assign(assign({}, $$props), exclude_internal_props($$new_props)));
    		$$invalidate(6, $$restProps = compute_rest_props($$props, omit_props_names));
    		if ("class" in $$new_props) $$invalidate(7, className = $$new_props.class);
    		if ("backLink" in $$new_props) $$invalidate(0, backLink = $$new_props.backLink);
    		if ("backLinkUrl" in $$new_props) $$invalidate(1, backLinkUrl = $$new_props.backLinkUrl);
    		if ("backLinkForce" in $$new_props) $$invalidate(2, backLinkForce = $$new_props.backLinkForce);
    		if ("backLinkShowText" in $$new_props) $$invalidate(8, backLinkShowText = $$new_props.backLinkShowText);
    		if ("sliding" in $$new_props) $$invalidate(9, sliding = $$new_props.sliding);
    		if ("$$scope" in $$new_props) $$invalidate(14, $$scope = $$new_props.$$scope);
    	};

    	let classes;
    	let needBackLinkText;
    	let backLinkText;

    	$$self.$$.update = () => {
    		 $$invalidate(3, classes = Utils.classNames(className, "left", { sliding }, Mixins.colorClasses($$props)));

    		if ($$self.$$.dirty & /*backLinkShowText*/ 256) {
    			 $$invalidate(11, needBackLinkText = backLinkShowText);
    		}

    		if ($$self.$$.dirty & /*needBackLinkText, _theme*/ 3072) {
    			 if (typeof needBackLinkText === "undefined") $$invalidate(11, needBackLinkText = _theme && !_theme.md);
    		}

    		if ($$self.$$.dirty & /*backLink, needBackLinkText*/ 2049) {
    			 $$invalidate(4, backLinkText = backLink !== true && needBackLinkText
    			? backLink
    			: undefined);
    		}
    	};

    	$$props = exclude_internal_props($$props);

    	return [
    		backLink,
    		backLinkUrl,
    		backLinkForce,
    		classes,
    		backLinkText,
    		onBackClick,
    		$$restProps,
    		className,
    		backLinkShowText,
    		sliding,
    		_theme,
    		needBackLinkText,
    		dispatch,
    		$$props,
    		$$scope,
    		$$slots
    	];
    }

    class Nav_left extends SvelteComponent {
    	constructor(options) {
    		super();

    		init(this, options, instance$c, create_fragment$h, safe_not_equal, {
    			class: 7,
    			backLink: 0,
    			backLinkUrl: 1,
    			backLinkForce: 2,
    			backLinkShowText: 8,
    			sliding: 9
    		});
    	}
    }

    /* public/packages/svelte/components/nav-right.svelte generated by Svelte v3.22.3 */

    function create_fragment$i(ctx) {
    	let div;
    	let current;
    	const default_slot_template = /*$$slots*/ ctx[6].default;
    	const default_slot = create_slot(default_slot_template, ctx, /*$$scope*/ ctx[5], null);
    	let div_levels = [{ class: /*classes*/ ctx[0] }, restProps(/*$$restProps*/ ctx[1])];
    	let div_data = {};

    	for (let i = 0; i < div_levels.length; i += 1) {
    		div_data = assign(div_data, div_levels[i]);
    	}

    	return {
    		c() {
    			div = element("div");
    			if (default_slot) default_slot.c();
    			set_attributes(div, div_data);
    		},
    		m(target, anchor) {
    			insert(target, div, anchor);

    			if (default_slot) {
    				default_slot.m(div, null);
    			}

    			current = true;
    		},
    		p(ctx, [dirty]) {
    			if (default_slot) {
    				if (default_slot.p && dirty & /*$$scope*/ 32) {
    					default_slot.p(get_slot_context(default_slot_template, ctx, /*$$scope*/ ctx[5], null), get_slot_changes(default_slot_template, /*$$scope*/ ctx[5], dirty, null));
    				}
    			}

    			set_attributes(div, get_spread_update(div_levels, [
    				dirty & /*classes*/ 1 && { class: /*classes*/ ctx[0] },
    				dirty & /*restProps, $$restProps*/ 2 && restProps(/*$$restProps*/ ctx[1])
    			]));
    		},
    		i(local) {
    			if (current) return;
    			transition_in(default_slot, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(default_slot, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(div);
    			if (default_slot) default_slot.d(detaching);
    		}
    	};
    }

    function instance$d($$self, $$props, $$invalidate) {
    	const omit_props_names = ["class","sliding"];
    	let $$restProps = compute_rest_props($$props, omit_props_names);
    	let { class: className = undefined } = $$props;
    	let { sliding = undefined } = $$props;
    	let { $$slots = {}, $$scope } = $$props;

    	$$self.$set = $$new_props => {
    		$$invalidate(4, $$props = assign(assign({}, $$props), exclude_internal_props($$new_props)));
    		$$invalidate(1, $$restProps = compute_rest_props($$props, omit_props_names));
    		if ("class" in $$new_props) $$invalidate(2, className = $$new_props.class);
    		if ("sliding" in $$new_props) $$invalidate(3, sliding = $$new_props.sliding);
    		if ("$$scope" in $$new_props) $$invalidate(5, $$scope = $$new_props.$$scope);
    	};

    	let classes;

    	$$self.$$.update = () => {
    		 $$invalidate(0, classes = Utils.classNames(className, "right", { sliding }, Mixins.colorClasses($$props)));
    	};

    	$$props = exclude_internal_props($$props);
    	return [classes, $$restProps, className, sliding, $$props, $$scope, $$slots];
    }

    class Nav_right extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance$d, create_fragment$i, safe_not_equal, { class: 2, sliding: 3 });
    	}
    }

    /* public/packages/svelte/components/nav-title.svelte generated by Svelte v3.22.3 */

    function create_if_block_1$4(ctx) {
    	let t_value = Utils.text(/*title*/ ctx[0]) + "";
    	let t;

    	return {
    		c() {
    			t = text(t_value);
    		},
    		m(target, anchor) {
    			insert(target, t, anchor);
    		},
    		p(ctx, dirty) {
    			if (dirty & /*title*/ 1 && t_value !== (t_value = Utils.text(/*title*/ ctx[0]) + "")) set_data(t, t_value);
    		},
    		d(detaching) {
    			if (detaching) detach(t);
    		}
    	};
    }

    // (27:2) {#if typeof subtitle !== 'undefined'}
    function create_if_block$7(ctx) {
    	let span;
    	let t_value = Utils.text(/*subtitle*/ ctx[1]) + "";
    	let t;

    	return {
    		c() {
    			span = element("span");
    			t = text(t_value);
    			attr(span, "class", "subtitle");
    		},
    		m(target, anchor) {
    			insert(target, span, anchor);
    			append(span, t);
    		},
    		p(ctx, dirty) {
    			if (dirty & /*subtitle*/ 2 && t_value !== (t_value = Utils.text(/*subtitle*/ ctx[1]) + "")) set_data(t, t_value);
    		},
    		d(detaching) {
    			if (detaching) detach(span);
    		}
    	};
    }

    function create_fragment$j(ctx) {
    	let div;
    	let t0;
    	let t1;
    	let current;
    	let if_block0 = typeof /*title*/ ctx[0] !== "undefined" && create_if_block_1$4(ctx);
    	let if_block1 = typeof /*subtitle*/ ctx[1] !== "undefined" && create_if_block$7(ctx);
    	const default_slot_template = /*$$slots*/ ctx[8].default;
    	const default_slot = create_slot(default_slot_template, ctx, /*$$scope*/ ctx[7], null);
    	let div_levels = [{ class: /*classes*/ ctx[2] }, restProps(/*$$restProps*/ ctx[3])];
    	let div_data = {};

    	for (let i = 0; i < div_levels.length; i += 1) {
    		div_data = assign(div_data, div_levels[i]);
    	}

    	return {
    		c() {
    			div = element("div");
    			if (if_block0) if_block0.c();
    			t0 = space();
    			if (if_block1) if_block1.c();
    			t1 = space();
    			if (default_slot) default_slot.c();
    			set_attributes(div, div_data);
    		},
    		m(target, anchor) {
    			insert(target, div, anchor);
    			if (if_block0) if_block0.m(div, null);
    			append(div, t0);
    			if (if_block1) if_block1.m(div, null);
    			append(div, t1);

    			if (default_slot) {
    				default_slot.m(div, null);
    			}

    			current = true;
    		},
    		p(ctx, [dirty]) {
    			if (typeof /*title*/ ctx[0] !== "undefined") {
    				if (if_block0) {
    					if_block0.p(ctx, dirty);
    				} else {
    					if_block0 = create_if_block_1$4(ctx);
    					if_block0.c();
    					if_block0.m(div, t0);
    				}
    			} else if (if_block0) {
    				if_block0.d(1);
    				if_block0 = null;
    			}

    			if (typeof /*subtitle*/ ctx[1] !== "undefined") {
    				if (if_block1) {
    					if_block1.p(ctx, dirty);
    				} else {
    					if_block1 = create_if_block$7(ctx);
    					if_block1.c();
    					if_block1.m(div, t1);
    				}
    			} else if (if_block1) {
    				if_block1.d(1);
    				if_block1 = null;
    			}

    			if (default_slot) {
    				if (default_slot.p && dirty & /*$$scope*/ 128) {
    					default_slot.p(get_slot_context(default_slot_template, ctx, /*$$scope*/ ctx[7], null), get_slot_changes(default_slot_template, /*$$scope*/ ctx[7], dirty, null));
    				}
    			}

    			set_attributes(div, get_spread_update(div_levels, [
    				dirty & /*classes*/ 4 && { class: /*classes*/ ctx[2] },
    				dirty & /*restProps, $$restProps*/ 8 && restProps(/*$$restProps*/ ctx[3])
    			]));
    		},
    		i(local) {
    			if (current) return;
    			transition_in(default_slot, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(default_slot, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(div);
    			if (if_block0) if_block0.d();
    			if (if_block1) if_block1.d();
    			if (default_slot) default_slot.d(detaching);
    		}
    	};
    }

    function instance$e($$self, $$props, $$invalidate) {
    	const omit_props_names = ["class","title","subtitle","sliding"];
    	let $$restProps = compute_rest_props($$props, omit_props_names);
    	let { class: className = undefined } = $$props;
    	let { title = undefined } = $$props;
    	let { subtitle = undefined } = $$props;
    	let { sliding = undefined } = $$props;
    	let { $$slots = {}, $$scope } = $$props;

    	$$self.$set = $$new_props => {
    		$$invalidate(6, $$props = assign(assign({}, $$props), exclude_internal_props($$new_props)));
    		$$invalidate(3, $$restProps = compute_rest_props($$props, omit_props_names));
    		if ("class" in $$new_props) $$invalidate(4, className = $$new_props.class);
    		if ("title" in $$new_props) $$invalidate(0, title = $$new_props.title);
    		if ("subtitle" in $$new_props) $$invalidate(1, subtitle = $$new_props.subtitle);
    		if ("sliding" in $$new_props) $$invalidate(5, sliding = $$new_props.sliding);
    		if ("$$scope" in $$new_props) $$invalidate(7, $$scope = $$new_props.$$scope);
    	};

    	let classes;

    	$$self.$$.update = () => {
    		 $$invalidate(2, classes = Utils.classNames(className, "title", { sliding }, Mixins.colorClasses($$props)));
    	};

    	$$props = exclude_internal_props($$props);

    	return [
    		title,
    		subtitle,
    		classes,
    		$$restProps,
    		className,
    		sliding,
    		$$props,
    		$$scope,
    		$$slots
    	];
    }

    class Nav_title extends SvelteComponent {
    	constructor(options) {
    		super();

    		init(this, options, instance$e, create_fragment$j, safe_not_equal, {
    			class: 4,
    			title: 0,
    			subtitle: 1,
    			sliding: 5
    		});
    	}
    }

    /* public/packages/svelte/components/navbar.svelte generated by Svelte v3.22.3 */
    const get_after_inner_slot_changes$1 = dirty => ({});
    const get_after_inner_slot_context$1 = ctx => ({});
    const get_title_large_slot_changes = dirty => ({});
    const get_title_large_slot_context = ctx => ({});
    const get_right_slot_changes = dirty => ({});
    const get_right_slot_context = ctx => ({});
    const get_nav_right_slot_changes = dirty => ({});
    const get_nav_right_slot_context = ctx => ({});
    const get_title_slot_changes = dirty => ({});
    const get_title_slot_context = ctx => ({});
    const get_left_slot_changes = dirty => ({});
    const get_left_slot_context = ctx => ({});
    const get_nav_left_slot_changes = dirty => ({});
    const get_nav_left_slot_context = ctx => ({});
    const get_before_inner_slot_changes$1 = dirty => ({});
    const get_before_inner_slot_context$1 = ctx => ({});

    // (218:4) {#if backLink || hasLeftSlots}
    function create_if_block_3$3(ctx) {
    	let current;

    	const navleft = new Nav_left({
    			props: {
    				backLink: /*backLink*/ ctx[0],
    				backLinkUrl: /*backLinkUrl*/ ctx[1],
    				backLinkForce: /*backLinkForce*/ ctx[2],
    				backLinkShowText: /*backLinkShowText*/ ctx[3],
    				onBackClick: /*onBackClick*/ ctx[15],
    				$$slots: { default: [create_default_slot_2$1] },
    				$$scope: { ctx }
    			}
    		});

    	return {
    		c() {
    			create_component(navleft.$$.fragment);
    		},
    		m(target, anchor) {
    			mount_component(navleft, target, anchor);
    			current = true;
    		},
    		p(ctx, dirty) {
    			const navleft_changes = {};
    			if (dirty[0] & /*backLink*/ 1) navleft_changes.backLink = /*backLink*/ ctx[0];
    			if (dirty[0] & /*backLinkUrl*/ 2) navleft_changes.backLinkUrl = /*backLinkUrl*/ ctx[1];
    			if (dirty[0] & /*backLinkForce*/ 4) navleft_changes.backLinkForce = /*backLinkForce*/ ctx[2];
    			if (dirty[0] & /*backLinkShowText*/ 8) navleft_changes.backLinkShowText = /*backLinkShowText*/ ctx[3];

    			if (dirty[1] & /*$$scope*/ 268435456) {
    				navleft_changes.$$scope = { dirty, ctx };
    			}

    			navleft.$set(navleft_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(navleft.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(navleft.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			destroy_component(navleft, detaching);
    		}
    	};
    }

    // (219:6) <NavLeft         backLink={backLink}         backLinkUrl={backLinkUrl}         backLinkForce={backLinkForce}         backLinkShowText={backLinkShowText}         onBackClick={onBackClick}       >
    function create_default_slot_2$1(ctx) {
    	let t;
    	let current;
    	const nav_left_slot_template = /*$$slots*/ ctx[57]["nav-left"];
    	const nav_left_slot = create_slot(nav_left_slot_template, ctx, /*$$scope*/ ctx[59], get_nav_left_slot_context);
    	const left_slot_template = /*$$slots*/ ctx[57].left;
    	const left_slot = create_slot(left_slot_template, ctx, /*$$scope*/ ctx[59], get_left_slot_context);

    	return {
    		c() {
    			if (nav_left_slot) nav_left_slot.c();
    			t = space();
    			if (left_slot) left_slot.c();
    		},
    		m(target, anchor) {
    			if (nav_left_slot) {
    				nav_left_slot.m(target, anchor);
    			}

    			insert(target, t, anchor);

    			if (left_slot) {
    				left_slot.m(target, anchor);
    			}

    			current = true;
    		},
    		p(ctx, dirty) {
    			if (nav_left_slot) {
    				if (nav_left_slot.p && dirty[1] & /*$$scope*/ 268435456) {
    					nav_left_slot.p(get_slot_context(nav_left_slot_template, ctx, /*$$scope*/ ctx[59], get_nav_left_slot_context), get_slot_changes(nav_left_slot_template, /*$$scope*/ ctx[59], dirty, get_nav_left_slot_changes));
    				}
    			}

    			if (left_slot) {
    				if (left_slot.p && dirty[1] & /*$$scope*/ 268435456) {
    					left_slot.p(get_slot_context(left_slot_template, ctx, /*$$scope*/ ctx[59], get_left_slot_context), get_slot_changes(left_slot_template, /*$$scope*/ ctx[59], dirty, get_left_slot_changes));
    				}
    			}
    		},
    		i(local) {
    			if (current) return;
    			transition_in(nav_left_slot, local);
    			transition_in(left_slot, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(nav_left_slot, local);
    			transition_out(left_slot, local);
    			current = false;
    		},
    		d(detaching) {
    			if (nav_left_slot) nav_left_slot.d(detaching);
    			if (detaching) detach(t);
    			if (left_slot) left_slot.d(detaching);
    		}
    	};
    }

    // (230:4) {#if title || subtitle || hasTitleSlots}
    function create_if_block_2$3(ctx) {
    	let current;

    	const navtitle = new Nav_title({
    			props: {
    				title: /*title*/ ctx[4],
    				subtitle: /*subtitle*/ ctx[5],
    				$$slots: { default: [create_default_slot_1$1] },
    				$$scope: { ctx }
    			}
    		});

    	return {
    		c() {
    			create_component(navtitle.$$.fragment);
    		},
    		m(target, anchor) {
    			mount_component(navtitle, target, anchor);
    			current = true;
    		},
    		p(ctx, dirty) {
    			const navtitle_changes = {};
    			if (dirty[0] & /*title*/ 16) navtitle_changes.title = /*title*/ ctx[4];
    			if (dirty[0] & /*subtitle*/ 32) navtitle_changes.subtitle = /*subtitle*/ ctx[5];

    			if (dirty[1] & /*$$scope*/ 268435456) {
    				navtitle_changes.$$scope = { dirty, ctx };
    			}

    			navtitle.$set(navtitle_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(navtitle.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(navtitle.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			destroy_component(navtitle, detaching);
    		}
    	};
    }

    // (231:6) <NavTitle         title={title}         subtitle={subtitle}       >
    function create_default_slot_1$1(ctx) {
    	let current;
    	const title_slot_template = /*$$slots*/ ctx[57].title;
    	const title_slot = create_slot(title_slot_template, ctx, /*$$scope*/ ctx[59], get_title_slot_context);

    	return {
    		c() {
    			if (title_slot) title_slot.c();
    		},
    		m(target, anchor) {
    			if (title_slot) {
    				title_slot.m(target, anchor);
    			}

    			current = true;
    		},
    		p(ctx, dirty) {
    			if (title_slot) {
    				if (title_slot.p && dirty[1] & /*$$scope*/ 268435456) {
    					title_slot.p(get_slot_context(title_slot_template, ctx, /*$$scope*/ ctx[59], get_title_slot_context), get_slot_changes(title_slot_template, /*$$scope*/ ctx[59], dirty, get_title_slot_changes));
    				}
    			}
    		},
    		i(local) {
    			if (current) return;
    			transition_in(title_slot, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(title_slot, local);
    			current = false;
    		},
    		d(detaching) {
    			if (title_slot) title_slot.d(detaching);
    		}
    	};
    }

    // (238:4) {#if hasRightSlots}
    function create_if_block_1$5(ctx) {
    	let current;

    	const navright = new Nav_right({
    			props: {
    				$$slots: { default: [create_default_slot$2] },
    				$$scope: { ctx }
    			}
    		});

    	return {
    		c() {
    			create_component(navright.$$.fragment);
    		},
    		m(target, anchor) {
    			mount_component(navright, target, anchor);
    			current = true;
    		},
    		p(ctx, dirty) {
    			const navright_changes = {};

    			if (dirty[1] & /*$$scope*/ 268435456) {
    				navright_changes.$$scope = { dirty, ctx };
    			}

    			navright.$set(navright_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(navright.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(navright.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			destroy_component(navright, detaching);
    		}
    	};
    }

    // (239:6) <NavRight>
    function create_default_slot$2(ctx) {
    	let t;
    	let current;
    	const nav_right_slot_template = /*$$slots*/ ctx[57]["nav-right"];
    	const nav_right_slot = create_slot(nav_right_slot_template, ctx, /*$$scope*/ ctx[59], get_nav_right_slot_context);
    	const right_slot_template = /*$$slots*/ ctx[57].right;
    	const right_slot = create_slot(right_slot_template, ctx, /*$$scope*/ ctx[59], get_right_slot_context);

    	return {
    		c() {
    			if (nav_right_slot) nav_right_slot.c();
    			t = space();
    			if (right_slot) right_slot.c();
    		},
    		m(target, anchor) {
    			if (nav_right_slot) {
    				nav_right_slot.m(target, anchor);
    			}

    			insert(target, t, anchor);

    			if (right_slot) {
    				right_slot.m(target, anchor);
    			}

    			current = true;
    		},
    		p(ctx, dirty) {
    			if (nav_right_slot) {
    				if (nav_right_slot.p && dirty[1] & /*$$scope*/ 268435456) {
    					nav_right_slot.p(get_slot_context(nav_right_slot_template, ctx, /*$$scope*/ ctx[59], get_nav_right_slot_context), get_slot_changes(nav_right_slot_template, /*$$scope*/ ctx[59], dirty, get_nav_right_slot_changes));
    				}
    			}

    			if (right_slot) {
    				if (right_slot.p && dirty[1] & /*$$scope*/ 268435456) {
    					right_slot.p(get_slot_context(right_slot_template, ctx, /*$$scope*/ ctx[59], get_right_slot_context), get_slot_changes(right_slot_template, /*$$scope*/ ctx[59], dirty, get_right_slot_changes));
    				}
    			}
    		},
    		i(local) {
    			if (current) return;
    			transition_in(nav_right_slot, local);
    			transition_in(right_slot, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(nav_right_slot, local);
    			transition_out(right_slot, local);
    			current = false;
    		},
    		d(detaching) {
    			if (nav_right_slot) nav_right_slot.d(detaching);
    			if (detaching) detach(t);
    			if (right_slot) right_slot.d(detaching);
    		}
    	};
    }

    // (244:4) {#if largeTitle || hasTitleLargeSlots}
    function create_if_block$8(ctx) {
    	let div1;
    	let div0;
    	let t0_value = Utils.text(/*largeTitle*/ ctx[11]) + "";
    	let t0;
    	let t1;
    	let current;
    	const title_large_slot_template = /*$$slots*/ ctx[57]["title-large"];
    	const title_large_slot = create_slot(title_large_slot_template, ctx, /*$$scope*/ ctx[59], get_title_large_slot_context);

    	return {
    		c() {
    			div1 = element("div");
    			div0 = element("div");
    			t0 = text(t0_value);
    			t1 = space();
    			if (title_large_slot) title_large_slot.c();
    			attr(div0, "class", "title-large-text");
    			attr(div1, "class", "title-large");
    		},
    		m(target, anchor) {
    			insert(target, div1, anchor);
    			append(div1, div0);
    			append(div0, t0);
    			append(div0, t1);

    			if (title_large_slot) {
    				title_large_slot.m(div0, null);
    			}

    			current = true;
    		},
    		p(ctx, dirty) {
    			if ((!current || dirty[0] & /*largeTitle*/ 2048) && t0_value !== (t0_value = Utils.text(/*largeTitle*/ ctx[11]) + "")) set_data(t0, t0_value);

    			if (title_large_slot) {
    				if (title_large_slot.p && dirty[1] & /*$$scope*/ 268435456) {
    					title_large_slot.p(get_slot_context(title_large_slot_template, ctx, /*$$scope*/ ctx[59], get_title_large_slot_context), get_slot_changes(title_large_slot_template, /*$$scope*/ ctx[59], dirty, get_title_large_slot_changes));
    				}
    			}
    		},
    		i(local) {
    			if (current) return;
    			transition_in(title_large_slot, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(title_large_slot, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(div1);
    			if (title_large_slot) title_large_slot.d(detaching);
    		}
    	};
    }

    function create_fragment$k(ctx) {
    	let div2;
    	let div0;
    	let t0;
    	let t1;
    	let div1;
    	let t2;
    	let t3;
    	let t4;
    	let t5;
    	let t6;
    	let current;
    	const before_inner_slot_template = /*$$slots*/ ctx[57]["before-inner"];
    	const before_inner_slot = create_slot(before_inner_slot_template, ctx, /*$$scope*/ ctx[59], get_before_inner_slot_context$1);
    	let if_block0 = (/*backLink*/ ctx[0] || /*hasLeftSlots*/ ctx[8]) && create_if_block_3$3(ctx);
    	let if_block1 = (/*title*/ ctx[4] || /*subtitle*/ ctx[5] || /*hasTitleSlots*/ ctx[10]) && create_if_block_2$3(ctx);
    	let if_block2 = /*hasRightSlots*/ ctx[9] && create_if_block_1$5(ctx);
    	let if_block3 = (/*largeTitle*/ ctx[11] || /*hasTitleLargeSlots*/ ctx[12]) && create_if_block$8(ctx);
    	const default_slot_template = /*$$slots*/ ctx[57].default;
    	const default_slot = create_slot(default_slot_template, ctx, /*$$scope*/ ctx[59], null);
    	const after_inner_slot_template = /*$$slots*/ ctx[57]["after-inner"];
    	const after_inner_slot = create_slot(after_inner_slot_template, ctx, /*$$scope*/ ctx[59], get_after_inner_slot_context$1);

    	let div2_levels = [
    		{ class: /*classes*/ ctx[13] },
    		{ "data-f7-slot": /*f7Slot*/ ctx[6] },
    		restProps(/*$$restProps*/ ctx[16])
    	];

    	let div2_data = {};

    	for (let i = 0; i < div2_levels.length; i += 1) {
    		div2_data = assign(div2_data, div2_levels[i]);
    	}

    	return {
    		c() {
    			div2 = element("div");
    			div0 = element("div");
    			t0 = space();
    			if (before_inner_slot) before_inner_slot.c();
    			t1 = space();
    			div1 = element("div");
    			if (if_block0) if_block0.c();
    			t2 = space();
    			if (if_block1) if_block1.c();
    			t3 = space();
    			if (if_block2) if_block2.c();
    			t4 = space();
    			if (if_block3) if_block3.c();
    			t5 = space();
    			if (default_slot) default_slot.c();
    			t6 = space();
    			if (after_inner_slot) after_inner_slot.c();
    			attr(div0, "class", "navbar-bg");
    			attr(div1, "class", /*innerClasses*/ ctx[14]);
    			set_attributes(div2, div2_data);
    		},
    		m(target, anchor) {
    			insert(target, div2, anchor);
    			append(div2, div0);
    			append(div2, t0);

    			if (before_inner_slot) {
    				before_inner_slot.m(div2, null);
    			}

    			append(div2, t1);
    			append(div2, div1);
    			if (if_block0) if_block0.m(div1, null);
    			append(div1, t2);
    			if (if_block1) if_block1.m(div1, null);
    			append(div1, t3);
    			if (if_block2) if_block2.m(div1, null);
    			append(div1, t4);
    			if (if_block3) if_block3.m(div1, null);
    			append(div1, t5);

    			if (default_slot) {
    				default_slot.m(div1, null);
    			}

    			append(div2, t6);

    			if (after_inner_slot) {
    				after_inner_slot.m(div2, null);
    			}

    			/*div2_binding*/ ctx[58](div2);
    			current = true;
    		},
    		p(ctx, dirty) {
    			if (before_inner_slot) {
    				if (before_inner_slot.p && dirty[1] & /*$$scope*/ 268435456) {
    					before_inner_slot.p(get_slot_context(before_inner_slot_template, ctx, /*$$scope*/ ctx[59], get_before_inner_slot_context$1), get_slot_changes(before_inner_slot_template, /*$$scope*/ ctx[59], dirty, get_before_inner_slot_changes$1));
    				}
    			}

    			if (/*backLink*/ ctx[0] || /*hasLeftSlots*/ ctx[8]) {
    				if (if_block0) {
    					if_block0.p(ctx, dirty);

    					if (dirty[0] & /*backLink, hasLeftSlots*/ 257) {
    						transition_in(if_block0, 1);
    					}
    				} else {
    					if_block0 = create_if_block_3$3(ctx);
    					if_block0.c();
    					transition_in(if_block0, 1);
    					if_block0.m(div1, t2);
    				}
    			} else if (if_block0) {
    				group_outros();

    				transition_out(if_block0, 1, 1, () => {
    					if_block0 = null;
    				});

    				check_outros();
    			}

    			if (/*title*/ ctx[4] || /*subtitle*/ ctx[5] || /*hasTitleSlots*/ ctx[10]) {
    				if (if_block1) {
    					if_block1.p(ctx, dirty);

    					if (dirty[0] & /*title, subtitle, hasTitleSlots*/ 1072) {
    						transition_in(if_block1, 1);
    					}
    				} else {
    					if_block1 = create_if_block_2$3(ctx);
    					if_block1.c();
    					transition_in(if_block1, 1);
    					if_block1.m(div1, t3);
    				}
    			} else if (if_block1) {
    				group_outros();

    				transition_out(if_block1, 1, 1, () => {
    					if_block1 = null;
    				});

    				check_outros();
    			}

    			if (/*hasRightSlots*/ ctx[9]) {
    				if (if_block2) {
    					if_block2.p(ctx, dirty);

    					if (dirty[0] & /*hasRightSlots*/ 512) {
    						transition_in(if_block2, 1);
    					}
    				} else {
    					if_block2 = create_if_block_1$5(ctx);
    					if_block2.c();
    					transition_in(if_block2, 1);
    					if_block2.m(div1, t4);
    				}
    			} else if (if_block2) {
    				group_outros();

    				transition_out(if_block2, 1, 1, () => {
    					if_block2 = null;
    				});

    				check_outros();
    			}

    			if (/*largeTitle*/ ctx[11] || /*hasTitleLargeSlots*/ ctx[12]) {
    				if (if_block3) {
    					if_block3.p(ctx, dirty);

    					if (dirty[0] & /*largeTitle, hasTitleLargeSlots*/ 6144) {
    						transition_in(if_block3, 1);
    					}
    				} else {
    					if_block3 = create_if_block$8(ctx);
    					if_block3.c();
    					transition_in(if_block3, 1);
    					if_block3.m(div1, t5);
    				}
    			} else if (if_block3) {
    				group_outros();

    				transition_out(if_block3, 1, 1, () => {
    					if_block3 = null;
    				});

    				check_outros();
    			}

    			if (default_slot) {
    				if (default_slot.p && dirty[1] & /*$$scope*/ 268435456) {
    					default_slot.p(get_slot_context(default_slot_template, ctx, /*$$scope*/ ctx[59], null), get_slot_changes(default_slot_template, /*$$scope*/ ctx[59], dirty, null));
    				}
    			}

    			if (!current || dirty[0] & /*innerClasses*/ 16384) {
    				attr(div1, "class", /*innerClasses*/ ctx[14]);
    			}

    			if (after_inner_slot) {
    				if (after_inner_slot.p && dirty[1] & /*$$scope*/ 268435456) {
    					after_inner_slot.p(get_slot_context(after_inner_slot_template, ctx, /*$$scope*/ ctx[59], get_after_inner_slot_context$1), get_slot_changes(after_inner_slot_template, /*$$scope*/ ctx[59], dirty, get_after_inner_slot_changes$1));
    				}
    			}

    			set_attributes(div2, get_spread_update(div2_levels, [
    				dirty[0] & /*classes*/ 8192 && { class: /*classes*/ ctx[13] },
    				dirty[0] & /*f7Slot*/ 64 && { "data-f7-slot": /*f7Slot*/ ctx[6] },
    				dirty[0] & /*$$restProps*/ 65536 && restProps(/*$$restProps*/ ctx[16])
    			]));
    		},
    		i(local) {
    			if (current) return;
    			transition_in(before_inner_slot, local);
    			transition_in(if_block0);
    			transition_in(if_block1);
    			transition_in(if_block2);
    			transition_in(if_block3);
    			transition_in(default_slot, local);
    			transition_in(after_inner_slot, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(before_inner_slot, local);
    			transition_out(if_block0);
    			transition_out(if_block1);
    			transition_out(if_block2);
    			transition_out(if_block3);
    			transition_out(default_slot, local);
    			transition_out(after_inner_slot, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(div2);
    			if (before_inner_slot) before_inner_slot.d(detaching);
    			if (if_block0) if_block0.d();
    			if (if_block1) if_block1.d();
    			if (if_block2) if_block2.d();
    			if (if_block3) if_block3.d();
    			if (default_slot) default_slot.d(detaching);
    			if (after_inner_slot) after_inner_slot.d(detaching);
    			/*div2_binding*/ ctx[58](null);
    		}
    	};
    }

    function instance$f($$self, $$props, $$invalidate) {
    	const omit_props_names = [
    		"class","backLink","backLinkUrl","backLinkForce","backLinkShowText","sliding","title","subtitle","hidden","noShadow","noHairline","innerClass","innerClassName","large","largeTransparent","transparent","titleLarge","f7Slot","hide","show","size"
    	];

    	let $$restProps = compute_rest_props($$props, omit_props_names);
    	const dispatch = createEventDispatcher();
    	let { class: className = undefined } = $$props;
    	let { backLink = undefined } = $$props;
    	let { backLinkUrl = undefined } = $$props;
    	let { backLinkForce = false } = $$props;
    	let { backLinkShowText = undefined } = $$props;
    	let { sliding = true } = $$props;
    	let { title = undefined } = $$props;
    	let { subtitle = undefined } = $$props;
    	let { hidden = false } = $$props;
    	let { noShadow = false } = $$props;
    	let { noHairline = false } = $$props;
    	let { innerClass = undefined } = $$props;
    	let { innerClassName = undefined } = $$props;
    	let { large = false } = $$props;
    	let { largeTransparent = false } = $$props;
    	let { transparent = false } = $$props;
    	let { titleLarge = undefined } = $$props;
    	let { f7Slot = "fixed" } = $$props;
    	let el;

    	// eslint-disable-next-line
    	let _theme = f7.instance ? f7Theme : null;

    	let routerPositionClass = "";
    	let largeCollapsed = false;
    	let routerNavbarRole = null;
    	let routerNavbarRoleDetailRoot = false;
    	let routerNavbarMasterStack = false;
    	let transparentVisible = false;

    	function hide(animate) {
    		f7.navbar.hide(el, animate);
    	}

    	function show(animate) {
    		f7.navbar.show(el, animate);
    	}

    	function size() {
    		f7.navbar.size(el);
    	}

    	if (!f7.instance) {
    		f7.ready(() => {
    			$$invalidate(31, _theme = f7Theme);
    		});
    	}

    	function onHide(navbarEl) {
    		if (el !== navbarEl) return;
    		dispatch("navbarHide");
    		if (typeof $$props.onNavbarHide === "function") $$props.onNavbarHide();
    	}

    	function onShow(navbarEl) {
    		if (el !== navbarEl) return;
    		dispatch("navbarShow");
    		if (typeof $$props.onNavbarShow === "function") $$props.onNavbarShow();
    	}

    	function onNavbarTransparentShow(navbarEl) {
    		if (el !== navbarEl) return;
    		$$invalidate(37, transparentVisible = true);
    		dispatch("navbarTransparentShow");
    		if (typeof $$props.onNavbarTransparentShow === "function") $$props.onNavbarTransparentShow();
    	}

    	function onNavbarTransparentHide(navbarEl) {
    		if (el !== navbarEl) return;
    		$$invalidate(37, transparentVisible = false);
    		dispatch("navbarTransparentHide");
    		if (typeof $$props.onNavbarTransparentHide === "function") $$props.onNavbarTransparentHide();
    	}

    	function onExpand(navbarEl) {
    		if (el !== navbarEl) return;
    		$$invalidate(33, largeCollapsed = false);
    		dispatch("navbarExpand");
    		if (typeof $$props.onNavbarExpand === "function") $$props.onNavbarExpand();
    	}

    	function onCollapse(navbarEl) {
    		if (el !== navbarEl) return;
    		$$invalidate(33, largeCollapsed = true);
    		dispatch("navbarCollapse");
    		if (typeof $$props.onNavbarCollapse === "function") $$props.onNavbarCollapse();
    	}

    	function onNavbarPosition(navbarEl, position) {
    		if (el !== navbarEl) return;
    		$$invalidate(32, routerPositionClass = position ? `navbar-${position}` : position);
    	}

    	function onNavbarRole(navbarEl, rolesData) {
    		if (el !== navbarEl) return;
    		$$invalidate(34, routerNavbarRole = rolesData.role);
    		$$invalidate(35, routerNavbarRoleDetailRoot = rolesData.detailRoot);
    	}

    	function onNavbarMasterStack(navbarEl) {
    		if (el !== navbarEl) return;
    		$$invalidate(36, routerNavbarMasterStack = true);
    	}

    	function onNavbarMasterUnstack(navbarEl) {
    		if (el !== navbarEl) return;
    		$$invalidate(36, routerNavbarMasterStack = false);
    	}

    	function onBackClick() {
    		dispatch("clickBack");
    		if (typeof $$props.onClickBack === "function") $$props.onClickBack();
    	}

    	function mountNavbar() {
    		f7.instance.on("navbarShow", onShow);
    		f7.instance.on("navbarHide", onHide);
    		f7.instance.on("navbarCollapse", onCollapse);
    		f7.instance.on("navbarExpand", onExpand);
    		f7.instance.on("navbarPosition", onNavbarPosition);
    		f7.instance.on("navbarRole", onNavbarRole);
    		f7.instance.on("navbarMasterStack", onNavbarMasterStack);
    		f7.instance.on("navbarMasterUnstack", onNavbarMasterUnstack);
    		f7.instance.on("navbarTransparentShow", onNavbarTransparentShow);
    		f7.instance.on("navbarTransparentHide", onNavbarTransparentHide);
    	}

    	function destroyNavbar() {
    		f7.instance.off("navbarShow", onShow);
    		f7.instance.off("navbarHide", onHide);
    		f7.instance.off("navbarCollapse", onCollapse);
    		f7.instance.off("navbarExpand", onExpand);
    		f7.instance.off("navbarPosition", onNavbarPosition);
    		f7.instance.off("navbarRole", onNavbarRole);
    		f7.instance.off("navbarMasterStack", onNavbarMasterStack);
    		f7.instance.off("navbarMasterUnstack", onNavbarMasterUnstack);
    		f7.instance.off("navbarTransparentShow", onNavbarTransparentShow);
    		f7.instance.off("navbarTransparentHide", onNavbarTransparentHide);
    	}

    	onMount(() => {
    		f7.ready(() => {
    			mountNavbar();
    		});
    	});

    	afterUpdate(() => {
    		if (!f7.instance) return;
    		f7.instance.navbar.size(el);
    	});

    	onDestroy(() => {
    		if (!f7.instance) return;
    		destroyNavbar();
    	});

    	let { $$slots = {}, $$scope } = $$props;

    	function div2_binding($$value) {
    		binding_callbacks[$$value ? "unshift" : "push"](() => {
    			$$invalidate(7, el = $$value);
    		});
    	}

    	$$self.$set = $$new_props => {
    		$$invalidate(56, $$props = assign(assign({}, $$props), exclude_internal_props($$new_props)));
    		$$invalidate(16, $$restProps = compute_rest_props($$props, omit_props_names));
    		if ("class" in $$new_props) $$invalidate(17, className = $$new_props.class);
    		if ("backLink" in $$new_props) $$invalidate(0, backLink = $$new_props.backLink);
    		if ("backLinkUrl" in $$new_props) $$invalidate(1, backLinkUrl = $$new_props.backLinkUrl);
    		if ("backLinkForce" in $$new_props) $$invalidate(2, backLinkForce = $$new_props.backLinkForce);
    		if ("backLinkShowText" in $$new_props) $$invalidate(3, backLinkShowText = $$new_props.backLinkShowText);
    		if ("sliding" in $$new_props) $$invalidate(18, sliding = $$new_props.sliding);
    		if ("title" in $$new_props) $$invalidate(4, title = $$new_props.title);
    		if ("subtitle" in $$new_props) $$invalidate(5, subtitle = $$new_props.subtitle);
    		if ("hidden" in $$new_props) $$invalidate(19, hidden = $$new_props.hidden);
    		if ("noShadow" in $$new_props) $$invalidate(20, noShadow = $$new_props.noShadow);
    		if ("noHairline" in $$new_props) $$invalidate(21, noHairline = $$new_props.noHairline);
    		if ("innerClass" in $$new_props) $$invalidate(22, innerClass = $$new_props.innerClass);
    		if ("innerClassName" in $$new_props) $$invalidate(23, innerClassName = $$new_props.innerClassName);
    		if ("large" in $$new_props) $$invalidate(24, large = $$new_props.large);
    		if ("largeTransparent" in $$new_props) $$invalidate(25, largeTransparent = $$new_props.largeTransparent);
    		if ("transparent" in $$new_props) $$invalidate(26, transparent = $$new_props.transparent);
    		if ("titleLarge" in $$new_props) $$invalidate(27, titleLarge = $$new_props.titleLarge);
    		if ("f7Slot" in $$new_props) $$invalidate(6, f7Slot = $$new_props.f7Slot);
    		if ("$$scope" in $$new_props) $$invalidate(59, $$scope = $$new_props.$$scope);
    	};

    	let hasLeftSlots;
    	let hasRightSlots;
    	let hasTitleSlots;
    	let largeTitle;
    	let hasTitleLargeSlots;
    	let addLeftTitleClass;
    	let addCenterTitleClass;
    	let isLarge;
    	let isTransparent;
    	let isTransparentVisible;
    	let classes;
    	let innerClasses;

    	$$self.$$.update = () => {
    		if ($$self.$$.dirty[0] & /*titleLarge, large, title*/ 150994960) {
    			 $$invalidate(11, largeTitle = titleLarge || large && title);
    		}

    		if ($$self.$$.dirty[1] & /*_theme*/ 1) {
    			 $$invalidate(38, addLeftTitleClass = _theme && _theme.ios && f7.instance && !f7.instance.params.navbar.iosCenterTitle);
    		}

    		if ($$self.$$.dirty[1] & /*_theme*/ 1) {
    			 $$invalidate(39, addCenterTitleClass = _theme && _theme.md && f7.instance && f7.instance.params.navbar.mdCenterTitle || _theme && _theme.aurora && f7.instance && f7.instance.params.navbar.auroraCenterTitle);
    		}

    		if ($$self.$$.dirty[0] & /*large, largeTransparent*/ 50331648) {
    			 $$invalidate(40, isLarge = large || largeTransparent);
    		}

    		if ($$self.$$.dirty[0] & /*transparent, largeTransparent*/ 100663296 | $$self.$$.dirty[1] & /*isLarge*/ 512) {
    			 $$invalidate(41, isTransparent = transparent || isLarge && largeTransparent);
    		}

    		if ($$self.$$.dirty[1] & /*isTransparent, transparentVisible*/ 1088) {
    			 $$invalidate(42, isTransparentVisible = isTransparent && transparentVisible);
    		}

    		 $$invalidate(13, classes = Utils.classNames(
    			className,
    			"navbar",
    			routerPositionClass,
    			{
    				"navbar-hidden": hidden,
    				"navbar-large": isLarge,
    				"navbar-large-collapsed": isLarge && largeCollapsed,
    				"navbar-transparent": isTransparent,
    				"navbar-transparent-visible": isTransparentVisible,
    				"navbar-master": routerNavbarRole === "master",
    				"navbar-master-detail": routerNavbarRole === "detail",
    				"navbar-master-detail-root": routerNavbarRoleDetailRoot === true,
    				"navbar-master-stacked": routerNavbarMasterStack === true,
    				"no-shadow": noShadow,
    				"no-hairline": noHairline
    			},
    			Mixins.colorClasses($$props)
    		));

    		if ($$self.$$.dirty[0] & /*innerClass, innerClassName, sliding*/ 12845056 | $$self.$$.dirty[1] & /*addLeftTitleClass, addCenterTitleClass*/ 384) {
    			 $$invalidate(14, innerClasses = Utils.classNames("navbar-inner", innerClass, innerClassName, {
    				sliding,
    				"navbar-inner-left-title": addLeftTitleClass,
    				"navbar-inner-centered-title": addCenterTitleClass
    			}));
    		}
    	};

    	 $$invalidate(8, hasLeftSlots = hasSlots(arguments, "nav-left") || hasSlots(arguments, "left"));

    	// eslint-disable-next-line
    	 $$invalidate(9, hasRightSlots = hasSlots(arguments, "nav-right") || hasSlots(arguments, "right"));

    	// eslint-disable-next-line
    	 $$invalidate(10, hasTitleSlots = hasSlots(arguments, "title"));

    	// eslint-disable-next-line
    	 $$invalidate(12, hasTitleLargeSlots = hasSlots(arguments, "title-large"));

    	$$props = exclude_internal_props($$props);

    	return [
    		backLink,
    		backLinkUrl,
    		backLinkForce,
    		backLinkShowText,
    		title,
    		subtitle,
    		f7Slot,
    		el,
    		hasLeftSlots,
    		hasRightSlots,
    		hasTitleSlots,
    		largeTitle,
    		hasTitleLargeSlots,
    		classes,
    		innerClasses,
    		onBackClick,
    		$$restProps,
    		className,
    		sliding,
    		hidden,
    		noShadow,
    		noHairline,
    		innerClass,
    		innerClassName,
    		large,
    		largeTransparent,
    		transparent,
    		titleLarge,
    		hide,
    		show,
    		size,
    		_theme,
    		routerPositionClass,
    		largeCollapsed,
    		routerNavbarRole,
    		routerNavbarRoleDetailRoot,
    		routerNavbarMasterStack,
    		transparentVisible,
    		addLeftTitleClass,
    		addCenterTitleClass,
    		isLarge,
    		isTransparent,
    		isTransparentVisible,
    		dispatch,
    		onHide,
    		onShow,
    		onNavbarTransparentShow,
    		onNavbarTransparentHide,
    		onExpand,
    		onCollapse,
    		onNavbarPosition,
    		onNavbarRole,
    		onNavbarMasterStack,
    		onNavbarMasterUnstack,
    		mountNavbar,
    		destroyNavbar,
    		$$props,
    		$$slots,
    		div2_binding,
    		$$scope
    	];
    }

    class Navbar extends SvelteComponent {
    	constructor(options) {
    		super();

    		init(
    			this,
    			options,
    			instance$f,
    			create_fragment$k,
    			safe_not_equal,
    			{
    				class: 17,
    				backLink: 0,
    				backLinkUrl: 1,
    				backLinkForce: 2,
    				backLinkShowText: 3,
    				sliding: 18,
    				title: 4,
    				subtitle: 5,
    				hidden: 19,
    				noShadow: 20,
    				noHairline: 21,
    				innerClass: 22,
    				innerClassName: 23,
    				large: 24,
    				largeTransparent: 25,
    				transparent: 26,
    				titleLarge: 27,
    				f7Slot: 6,
    				hide: 28,
    				show: 29,
    				size: 30
    			},
    			[-1, -1]
    		);
    	}

    	get hide() {
    		return this.$$.ctx[28];
    	}

    	get show() {
    		return this.$$.ctx[29];
    	}

    	get size() {
    		return this.$$.ctx[30];
    	}
    }

    /* public/packages/svelte/components/preloader.svelte generated by Svelte v3.22.3 */

    function create_else_block$1(ctx) {
    	let span;

    	return {
    		c() {
    			span = element("span");
    			attr(span, "class", "preloader-inner");
    		},
    		m(target, anchor) {
    			insert(target, span, anchor);
    		},
    		d(detaching) {
    			if (detaching) detach(span);
    		}
    	};
    }

    // (63:36) 
    function create_if_block_2$4(ctx) {
    	let span1;

    	return {
    		c() {
    			span1 = element("span");
    			span1.innerHTML = `<span class="preloader-inner-circle"></span>`;
    			attr(span1, "class", "preloader-inner");
    		},
    		m(target, anchor) {
    			insert(target, span1, anchor);
    		},
    		d(detaching) {
    			if (detaching) detach(span1);
    		}
    	};
    }

    // (48:33) 
    function create_if_block_1$6(ctx) {
    	let span12;

    	return {
    		c() {
    			span12 = element("span");

    			span12.innerHTML = `<span class="preloader-inner-line"></span> 
    <span class="preloader-inner-line"></span> 
    <span class="preloader-inner-line"></span> 
    <span class="preloader-inner-line"></span> 
    <span class="preloader-inner-line"></span> 
    <span class="preloader-inner-line"></span> 
    <span class="preloader-inner-line"></span> 
    <span class="preloader-inner-line"></span> 
    <span class="preloader-inner-line"></span> 
    <span class="preloader-inner-line"></span> 
    <span class="preloader-inner-line"></span> 
    <span class="preloader-inner-line"></span>`;

    			attr(span12, "class", "preloader-inner");
    		},
    		m(target, anchor) {
    			insert(target, span12, anchor);
    		},
    		d(detaching) {
    			if (detaching) detach(span12);
    		}
    	};
    }

    // (38:2) {#if _theme && _theme.md}
    function create_if_block$9(ctx) {
    	let span5;

    	return {
    		c() {
    			span5 = element("span");

    			span5.innerHTML = `<span class="preloader-inner-gap"></span> 
    <span class="preloader-inner-left"><span class="preloader-inner-half-circle"></span></span> 
    <span class="preloader-inner-right"><span class="preloader-inner-half-circle"></span></span>`;

    			attr(span5, "class", "preloader-inner");
    		},
    		m(target, anchor) {
    			insert(target, span5, anchor);
    		},
    		d(detaching) {
    			if (detaching) detach(span5);
    		}
    	};
    }

    function create_fragment$l(ctx) {
    	let span;

    	function select_block_type(ctx, dirty) {
    		if (/*_theme*/ ctx[0] && /*_theme*/ ctx[0].md) return create_if_block$9;
    		if (/*_theme*/ ctx[0] && /*_theme*/ ctx[0].ios) return create_if_block_1$6;
    		if (/*_theme*/ ctx[0] && /*_theme*/ ctx[0].aurora) return create_if_block_2$4;
    		return create_else_block$1;
    	}

    	let current_block_type = select_block_type(ctx);
    	let if_block = current_block_type(ctx);

    	let span_levels = [
    		{ style: /*preloaderStyle*/ ctx[1] },
    		{ class: /*classes*/ ctx[2] },
    		restProps(/*$$restProps*/ ctx[3])
    	];

    	let span_data = {};

    	for (let i = 0; i < span_levels.length; i += 1) {
    		span_data = assign(span_data, span_levels[i]);
    	}

    	return {
    		c() {
    			span = element("span");
    			if_block.c();
    			set_attributes(span, span_data);
    		},
    		m(target, anchor) {
    			insert(target, span, anchor);
    			if_block.m(span, null);
    		},
    		p(ctx, [dirty]) {
    			if (current_block_type !== (current_block_type = select_block_type(ctx))) {
    				if_block.d(1);
    				if_block = current_block_type(ctx);

    				if (if_block) {
    					if_block.c();
    					if_block.m(span, null);
    				}
    			}

    			set_attributes(span, get_spread_update(span_levels, [
    				dirty & /*preloaderStyle*/ 2 && { style: /*preloaderStyle*/ ctx[1] },
    				dirty & /*classes*/ 4 && { class: /*classes*/ ctx[2] },
    				dirty & /*restProps, $$restProps*/ 8 && restProps(/*$$restProps*/ ctx[3])
    			]));
    		},
    		i: noop,
    		o: noop,
    		d(detaching) {
    			if (detaching) detach(span);
    			if_block.d();
    		}
    	};
    }

    function instance$g($$self, $$props, $$invalidate) {
    	const omit_props_names = ["style","class","size"];
    	let $$restProps = compute_rest_props($$props, omit_props_names);
    	let { style = undefined } = $$props;
    	let { class: className = undefined } = $$props;
    	let { size = undefined } = $$props;

    	// eslint-disable-next-line
    	let _theme = f7.instance ? f7Theme : null;

    	if (!f7.instance) {
    		f7.ready(() => {
    			$$invalidate(0, _theme = f7Theme);
    		});
    	}

    	$$self.$set = $$new_props => {
    		$$invalidate(8, $$props = assign(assign({}, $$props), exclude_internal_props($$new_props)));
    		$$invalidate(3, $$restProps = compute_rest_props($$props, omit_props_names));
    		if ("style" in $$new_props) $$invalidate(4, style = $$new_props.style);
    		if ("class" in $$new_props) $$invalidate(5, className = $$new_props.class);
    		if ("size" in $$new_props) $$invalidate(6, size = $$new_props.size);
    	};

    	let sizeComputed;
    	let preloaderStyle;
    	let classes;

    	$$self.$$.update = () => {
    		if ($$self.$$.dirty & /*size*/ 64) {
    			 $$invalidate(7, sizeComputed = size && typeof size === "string" && size.indexOf("px") >= 0
    			? size.replace("px", "")
    			: size);
    		}

    		if ($$self.$$.dirty & /*style, sizeComputed*/ 144) {
    			 $$invalidate(1, preloaderStyle = ((style || "") + (sizeComputed
    			? `;width: ${sizeComputed}px; height: ${sizeComputed}px; --f7-preloader-size: ${sizeComputed}px`
    			: "")).replace(";;", ";"));
    		}

    		 $$invalidate(2, classes = Utils.classNames(className, "preloader", Mixins.colorClasses($$props)));
    	};

    	$$props = exclude_internal_props($$props);
    	return [_theme, preloaderStyle, classes, $$restProps, style, className, size];
    }

    class Preloader extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance$g, create_fragment$l, safe_not_equal, { style: 4, class: 5, size: 6 });
    	}
    }

    /* public/packages/svelte/components/page-content.svelte generated by Svelte v3.22.3 */

    function create_if_block_3$4(ctx) {
    	let div1;
    	let t;
    	let div0;
    	let current;
    	const preloader = new Preloader({});

    	return {
    		c() {
    			div1 = element("div");
    			create_component(preloader.$$.fragment);
    			t = space();
    			div0 = element("div");
    			attr(div0, "class", "ptr-arrow");
    			attr(div1, "class", "ptr-preloader");
    		},
    		m(target, anchor) {
    			insert(target, div1, anchor);
    			mount_component(preloader, div1, null);
    			append(div1, t);
    			append(div1, div0);
    			current = true;
    		},
    		i(local) {
    			if (current) return;
    			transition_in(preloader.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(preloader.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(div1);
    			destroy_component(preloader);
    		}
    	};
    }

    // (153:2) {#if infinite && infiniteTop && infinitePreloader}
    function create_if_block_2$5(ctx) {
    	let current;

    	const preloader = new Preloader({
    			props: { class: "infinite-scroll-preloader" }
    		});

    	return {
    		c() {
    			create_component(preloader.$$.fragment);
    		},
    		m(target, anchor) {
    			mount_component(preloader, target, anchor);
    			current = true;
    		},
    		i(local) {
    			if (current) return;
    			transition_in(preloader.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(preloader.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			destroy_component(preloader, detaching);
    		}
    	};
    }

    // (157:2) {#if infinite && !infiniteTop && infinitePreloader}
    function create_if_block_1$7(ctx) {
    	let current;

    	const preloader = new Preloader({
    			props: { class: "infinite-scroll-preloader" }
    		});

    	return {
    		c() {
    			create_component(preloader.$$.fragment);
    		},
    		m(target, anchor) {
    			mount_component(preloader, target, anchor);
    			current = true;
    		},
    		i(local) {
    			if (current) return;
    			transition_in(preloader.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(preloader.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			destroy_component(preloader, detaching);
    		}
    	};
    }

    // (160:2) {#if ptr && ptrPreloader && ptrBottom}
    function create_if_block$a(ctx) {
    	let div1;
    	let t;
    	let div0;
    	let current;
    	const preloader = new Preloader({});

    	return {
    		c() {
    			div1 = element("div");
    			create_component(preloader.$$.fragment);
    			t = space();
    			div0 = element("div");
    			attr(div0, "class", "ptr-arrow");
    			attr(div1, "class", "ptr-preloader");
    		},
    		m(target, anchor) {
    			insert(target, div1, anchor);
    			mount_component(preloader, div1, null);
    			append(div1, t);
    			append(div1, div0);
    			current = true;
    		},
    		i(local) {
    			if (current) return;
    			transition_in(preloader.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(preloader.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(div1);
    			destroy_component(preloader);
    		}
    	};
    }

    function create_fragment$m(ctx) {
    	let div;
    	let t0;
    	let t1;
    	let t2;
    	let t3;
    	let current;
    	let if_block0 = /*ptr*/ ctx[0] && /*ptrPreloader*/ ctx[2] && !/*ptrBottom*/ ctx[3] && create_if_block_3$4();
    	let if_block1 = /*infinite*/ ctx[5] && /*infiniteTop*/ ctx[6] && /*infinitePreloader*/ ctx[8] && create_if_block_2$5();
    	const default_slot_template = /*$$slots*/ ctx[33].default;
    	const default_slot = create_slot(default_slot_template, ctx, /*$$scope*/ ctx[32], null);
    	let if_block2 = /*infinite*/ ctx[5] && !/*infiniteTop*/ ctx[6] && /*infinitePreloader*/ ctx[8] && create_if_block_1$7();
    	let if_block3 = /*ptr*/ ctx[0] && /*ptrPreloader*/ ctx[2] && /*ptrBottom*/ ctx[3] && create_if_block$a();

    	let div_levels = [
    		{ class: /*pageContentClasses*/ ctx[10] },
    		{
    			"data-ptr-distance": /*ptrDistance*/ ctx[1]
    		},
    		{
    			"data-ptr-mousewheel": /*ptrMousewheel*/ ctx[4] || undefined
    		},
    		{
    			"data-infinite-distance": /*infiniteDistance*/ ctx[7] || undefined
    		},
    		restProps(/*$$restProps*/ ctx[11])
    	];

    	let div_data = {};

    	for (let i = 0; i < div_levels.length; i += 1) {
    		div_data = assign(div_data, div_levels[i]);
    	}

    	return {
    		c() {
    			div = element("div");
    			if (if_block0) if_block0.c();
    			t0 = space();
    			if (if_block1) if_block1.c();
    			t1 = space();
    			if (default_slot) default_slot.c();
    			t2 = space();
    			if (if_block2) if_block2.c();
    			t3 = space();
    			if (if_block3) if_block3.c();
    			set_attributes(div, div_data);
    		},
    		m(target, anchor) {
    			insert(target, div, anchor);
    			if (if_block0) if_block0.m(div, null);
    			append(div, t0);
    			if (if_block1) if_block1.m(div, null);
    			append(div, t1);

    			if (default_slot) {
    				default_slot.m(div, null);
    			}

    			append(div, t2);
    			if (if_block2) if_block2.m(div, null);
    			append(div, t3);
    			if (if_block3) if_block3.m(div, null);
    			/*div_binding*/ ctx[34](div);
    			current = true;
    		},
    		p(ctx, dirty) {
    			if (/*ptr*/ ctx[0] && /*ptrPreloader*/ ctx[2] && !/*ptrBottom*/ ctx[3]) {
    				if (if_block0) {
    					if (dirty[0] & /*ptr, ptrPreloader, ptrBottom*/ 13) {
    						transition_in(if_block0, 1);
    					}
    				} else {
    					if_block0 = create_if_block_3$4();
    					if_block0.c();
    					transition_in(if_block0, 1);
    					if_block0.m(div, t0);
    				}
    			} else if (if_block0) {
    				group_outros();

    				transition_out(if_block0, 1, 1, () => {
    					if_block0 = null;
    				});

    				check_outros();
    			}

    			if (/*infinite*/ ctx[5] && /*infiniteTop*/ ctx[6] && /*infinitePreloader*/ ctx[8]) {
    				if (if_block1) {
    					if (dirty[0] & /*infinite, infiniteTop, infinitePreloader*/ 352) {
    						transition_in(if_block1, 1);
    					}
    				} else {
    					if_block1 = create_if_block_2$5();
    					if_block1.c();
    					transition_in(if_block1, 1);
    					if_block1.m(div, t1);
    				}
    			} else if (if_block1) {
    				group_outros();

    				transition_out(if_block1, 1, 1, () => {
    					if_block1 = null;
    				});

    				check_outros();
    			}

    			if (default_slot) {
    				if (default_slot.p && dirty[1] & /*$$scope*/ 2) {
    					default_slot.p(get_slot_context(default_slot_template, ctx, /*$$scope*/ ctx[32], null), get_slot_changes(default_slot_template, /*$$scope*/ ctx[32], dirty, null));
    				}
    			}

    			if (/*infinite*/ ctx[5] && !/*infiniteTop*/ ctx[6] && /*infinitePreloader*/ ctx[8]) {
    				if (if_block2) {
    					if (dirty[0] & /*infinite, infiniteTop, infinitePreloader*/ 352) {
    						transition_in(if_block2, 1);
    					}
    				} else {
    					if_block2 = create_if_block_1$7();
    					if_block2.c();
    					transition_in(if_block2, 1);
    					if_block2.m(div, t3);
    				}
    			} else if (if_block2) {
    				group_outros();

    				transition_out(if_block2, 1, 1, () => {
    					if_block2 = null;
    				});

    				check_outros();
    			}

    			if (/*ptr*/ ctx[0] && /*ptrPreloader*/ ctx[2] && /*ptrBottom*/ ctx[3]) {
    				if (if_block3) {
    					if (dirty[0] & /*ptr, ptrPreloader, ptrBottom*/ 13) {
    						transition_in(if_block3, 1);
    					}
    				} else {
    					if_block3 = create_if_block$a();
    					if_block3.c();
    					transition_in(if_block3, 1);
    					if_block3.m(div, null);
    				}
    			} else if (if_block3) {
    				group_outros();

    				transition_out(if_block3, 1, 1, () => {
    					if_block3 = null;
    				});

    				check_outros();
    			}

    			set_attributes(div, get_spread_update(div_levels, [
    				dirty[0] & /*pageContentClasses*/ 1024 && { class: /*pageContentClasses*/ ctx[10] },
    				dirty[0] & /*ptrDistance*/ 2 && {
    					"data-ptr-distance": /*ptrDistance*/ ctx[1]
    				},
    				dirty[0] & /*ptrMousewheel*/ 16 && {
    					"data-ptr-mousewheel": /*ptrMousewheel*/ ctx[4] || undefined
    				},
    				dirty[0] & /*infiniteDistance*/ 128 && {
    					"data-infinite-distance": /*infiniteDistance*/ ctx[7] || undefined
    				},
    				dirty[0] & /*$$restProps*/ 2048 && restProps(/*$$restProps*/ ctx[11])
    			]));
    		},
    		i(local) {
    			if (current) return;
    			transition_in(if_block0);
    			transition_in(if_block1);
    			transition_in(default_slot, local);
    			transition_in(if_block2);
    			transition_in(if_block3);
    			current = true;
    		},
    		o(local) {
    			transition_out(if_block0);
    			transition_out(if_block1);
    			transition_out(default_slot, local);
    			transition_out(if_block2);
    			transition_out(if_block3);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(div);
    			if (if_block0) if_block0.d();
    			if (if_block1) if_block1.d();
    			if (default_slot) default_slot.d(detaching);
    			if (if_block2) if_block2.d();
    			if (if_block3) if_block3.d();
    			/*div_binding*/ ctx[34](null);
    		}
    	};
    }

    function instance$h($$self, $$props, $$invalidate) {
    	const omit_props_names = [
    		"tab","tabActive","ptr","ptrDistance","ptrPreloader","ptrBottom","ptrMousewheel","infinite","infiniteTop","infiniteDistance","infinitePreloader","hideBarsOnScroll","hideNavbarOnScroll","hideToolbarOnScroll","messagesContent","loginScreen","class"
    	];

    	let $$restProps = compute_rest_props($$props, omit_props_names);
    	const dispatch = createEventDispatcher();
    	let { tab = false } = $$props;
    	let { tabActive = false } = $$props;
    	let { ptr = false } = $$props;
    	let { ptrDistance = undefined } = $$props;
    	let { ptrPreloader = true } = $$props;
    	let { ptrBottom = false } = $$props;
    	let { ptrMousewheel = false } = $$props;
    	let { infinite = false } = $$props;
    	let { infiniteTop = false } = $$props;
    	let { infiniteDistance = undefined } = $$props;
    	let { infinitePreloader = true } = $$props;
    	let { hideBarsOnScroll = false } = $$props;
    	let { hideNavbarOnScroll = false } = $$props;
    	let { hideToolbarOnScroll = false } = $$props;
    	let { messagesContent = false } = $$props;
    	let { loginScreen = false } = $$props;
    	let { class: className = undefined } = $$props;
    	let pageContentEl;

    	// Event handlers
    	function onPtrPullStart(ptrEl) {
    		if (ptrEl !== pageContentEl) return;
    		dispatch("ptrPullStart");
    		if (typeof $$props.onPtrPullStart === "function") $$props.onPtrPullStart();
    	}

    	function onPtrPullMove(ptrEl) {
    		if (ptrEl !== pageContentEl) return;
    		dispatch("ptrPullMove");
    		if (typeof $$props.onPtrPullMove === "function") $$props.onPtrPullMove();
    	}

    	function onPtrPullEnd(ptrEl) {
    		if (ptrEl !== pageContentEl) return;
    		dispatch("ptrPullEnd");
    		if (typeof $$props.onPtrPullEnd === "function") $$props.onPtrPullEnd();
    	}

    	function onPtrRefresh(ptrEl, done) {
    		if (ptrEl !== pageContentEl) return;
    		dispatch("ptrRefresh", [done]);
    		if (typeof $$props.onPtrRefresh === "function") $$props.onPtrRefresh(done);
    	}

    	function onPtrDone(ptrEl) {
    		if (ptrEl !== pageContentEl) return;
    		dispatch("ptrDone");
    		if (typeof $$props.onPtrDone === "function") $$props.onPtrDone();
    	}

    	function onInfinite(infEl) {
    		if (infEl !== pageContentEl) return;
    		dispatch("infinite");
    		if (typeof $$props.onInfinite === "function") $$props.onInfinite();
    	}

    	function onTabShow(tabEl) {
    		if (pageContentEl !== tabEl) return;
    		dispatch("tabShow");
    		if (typeof $$props.onTabShow === "function") $$props.onTabShow(tabEl);
    	}

    	function onTabHide(tabEl) {
    		if (pageContentEl !== tabEl) return;
    		dispatch("tabHide");
    		if (typeof $$props.onTabHide === "function") $$props.onTabHide(tabEl);
    	}

    	function mountPageContent() {
    		if (ptr) {
    			f7.instance.on("ptrPullStart", onPtrPullStart);
    			f7.instance.on("ptrPullMove", onPtrPullMove);
    			f7.instance.on("ptrPullEnd", onPtrPullEnd);
    			f7.instance.on("ptrRefresh", onPtrRefresh);
    			f7.instance.on("ptrDone", onPtrDone);
    		}

    		if (infinite) {
    			f7.instance.on("infinite", onInfinite);
    		}

    		if (tab) {
    			f7.instance.on("tabShow", onTabShow);
    			f7.instance.on("tabHide", onTabHide);
    		}
    	}

    	function destroyPageContent() {
    		if (ptr) {
    			f7.instance.off("ptrPullStart", onPtrPullStart);
    			f7.instance.off("ptrPullMove", onPtrPullMove);
    			f7.instance.off("ptrPullEnd", onPtrPullEnd);
    			f7.instance.off("ptrRefresh", onPtrRefresh);
    			f7.instance.off("ptrDone", onPtrDone);
    		}

    		if (infinite) {
    			f7.instance.off("infinite", onInfinite);
    		}

    		if (tab) {
    			f7.instance.off("tabShow", onTabShow);
    			f7.instance.off("tabHide", onTabHide);
    		}
    	}

    	onMount(() => {
    		f7.ready(() => {
    			mountPageContent();
    		});
    	});

    	onDestroy(() => {
    		if (!f7.instance) return;
    		destroyPageContent();
    	});

    	let { $$slots = {}, $$scope } = $$props;

    	function div_binding($$value) {
    		binding_callbacks[$$value ? "unshift" : "push"](() => {
    			$$invalidate(9, pageContentEl = $$value);
    		});
    	}

    	$$self.$set = $$new_props => {
    		$$invalidate(31, $$props = assign(assign({}, $$props), exclude_internal_props($$new_props)));
    		$$invalidate(11, $$restProps = compute_rest_props($$props, omit_props_names));
    		if ("tab" in $$new_props) $$invalidate(12, tab = $$new_props.tab);
    		if ("tabActive" in $$new_props) $$invalidate(13, tabActive = $$new_props.tabActive);
    		if ("ptr" in $$new_props) $$invalidate(0, ptr = $$new_props.ptr);
    		if ("ptrDistance" in $$new_props) $$invalidate(1, ptrDistance = $$new_props.ptrDistance);
    		if ("ptrPreloader" in $$new_props) $$invalidate(2, ptrPreloader = $$new_props.ptrPreloader);
    		if ("ptrBottom" in $$new_props) $$invalidate(3, ptrBottom = $$new_props.ptrBottom);
    		if ("ptrMousewheel" in $$new_props) $$invalidate(4, ptrMousewheel = $$new_props.ptrMousewheel);
    		if ("infinite" in $$new_props) $$invalidate(5, infinite = $$new_props.infinite);
    		if ("infiniteTop" in $$new_props) $$invalidate(6, infiniteTop = $$new_props.infiniteTop);
    		if ("infiniteDistance" in $$new_props) $$invalidate(7, infiniteDistance = $$new_props.infiniteDistance);
    		if ("infinitePreloader" in $$new_props) $$invalidate(8, infinitePreloader = $$new_props.infinitePreloader);
    		if ("hideBarsOnScroll" in $$new_props) $$invalidate(14, hideBarsOnScroll = $$new_props.hideBarsOnScroll);
    		if ("hideNavbarOnScroll" in $$new_props) $$invalidate(15, hideNavbarOnScroll = $$new_props.hideNavbarOnScroll);
    		if ("hideToolbarOnScroll" in $$new_props) $$invalidate(16, hideToolbarOnScroll = $$new_props.hideToolbarOnScroll);
    		if ("messagesContent" in $$new_props) $$invalidate(17, messagesContent = $$new_props.messagesContent);
    		if ("loginScreen" in $$new_props) $$invalidate(18, loginScreen = $$new_props.loginScreen);
    		if ("class" in $$new_props) $$invalidate(19, className = $$new_props.class);
    		if ("$$scope" in $$new_props) $$invalidate(32, $$scope = $$new_props.$$scope);
    	};

    	let pageContentClasses;

    	$$self.$$.update = () => {
    		 $$invalidate(10, pageContentClasses = Utils.classNames(
    			className,
    			"page-content",
    			{
    				tab,
    				"tab-active": tabActive,
    				"ptr-content": ptr,
    				"ptr-bottom": ptrBottom,
    				"infinite-scroll-content": infinite,
    				"infinite-scroll-top": infiniteTop,
    				"hide-bars-on-scroll": hideBarsOnScroll,
    				"hide-navbar-on-scroll": hideNavbarOnScroll,
    				"hide-toolbar-on-scroll": hideToolbarOnScroll,
    				"messages-content": messagesContent,
    				"login-screen-content": loginScreen
    			},
    			Mixins.colorClasses($$props)
    		));
    	};

    	$$props = exclude_internal_props($$props);

    	return [
    		ptr,
    		ptrDistance,
    		ptrPreloader,
    		ptrBottom,
    		ptrMousewheel,
    		infinite,
    		infiniteTop,
    		infiniteDistance,
    		infinitePreloader,
    		pageContentEl,
    		pageContentClasses,
    		$$restProps,
    		tab,
    		tabActive,
    		hideBarsOnScroll,
    		hideNavbarOnScroll,
    		hideToolbarOnScroll,
    		messagesContent,
    		loginScreen,
    		className,
    		dispatch,
    		onPtrPullStart,
    		onPtrPullMove,
    		onPtrPullEnd,
    		onPtrRefresh,
    		onPtrDone,
    		onInfinite,
    		onTabShow,
    		onTabHide,
    		mountPageContent,
    		destroyPageContent,
    		$$props,
    		$$scope,
    		$$slots,
    		div_binding
    	];
    }

    class Page_content extends SvelteComponent {
    	constructor(options) {
    		super();

    		init(
    			this,
    			options,
    			instance$h,
    			create_fragment$m,
    			safe_not_equal,
    			{
    				tab: 12,
    				tabActive: 13,
    				ptr: 0,
    				ptrDistance: 1,
    				ptrPreloader: 2,
    				ptrBottom: 3,
    				ptrMousewheel: 4,
    				infinite: 5,
    				infiniteTop: 6,
    				infiniteDistance: 7,
    				infinitePreloader: 8,
    				hideBarsOnScroll: 14,
    				hideNavbarOnScroll: 15,
    				hideToolbarOnScroll: 16,
    				messagesContent: 17,
    				loginScreen: 18,
    				class: 19
    			},
    			[-1, -1]
    		);
    	}
    }

    /* public/packages/svelte/components/page.svelte generated by Svelte v3.22.3 */
    const get_static_slot_changes_1 = dirty => ({});
    const get_static_slot_context_1 = ctx => ({});
    const get_static_slot_changes = dirty => ({});
    const get_static_slot_context = ctx => ({});
    const get_fixed_slot_changes = dirty => ({});
    const get_fixed_slot_context = ctx => ({});

    // (353:2) {:else}
    function create_else_block$2(ctx) {
    	let t;
    	let current;
    	const static_slot_template = /*$$slots*/ ctx[71].static;
    	const static_slot = create_slot(static_slot_template, ctx, /*$$scope*/ ctx[73], get_static_slot_context_1);
    	const default_slot_template = /*$$slots*/ ctx[71].default;
    	const default_slot = create_slot(default_slot_template, ctx, /*$$scope*/ ctx[73], null);

    	return {
    		c() {
    			if (static_slot) static_slot.c();
    			t = space();
    			if (default_slot) default_slot.c();
    		},
    		m(target, anchor) {
    			if (static_slot) {
    				static_slot.m(target, anchor);
    			}

    			insert(target, t, anchor);

    			if (default_slot) {
    				default_slot.m(target, anchor);
    			}

    			current = true;
    		},
    		p(ctx, dirty) {
    			if (static_slot) {
    				if (static_slot.p && dirty[2] & /*$$scope*/ 2048) {
    					static_slot.p(get_slot_context(static_slot_template, ctx, /*$$scope*/ ctx[73], get_static_slot_context_1), get_slot_changes(static_slot_template, /*$$scope*/ ctx[73], dirty, get_static_slot_changes_1));
    				}
    			}

    			if (default_slot) {
    				if (default_slot.p && dirty[2] & /*$$scope*/ 2048) {
    					default_slot.p(get_slot_context(default_slot_template, ctx, /*$$scope*/ ctx[73], null), get_slot_changes(default_slot_template, /*$$scope*/ ctx[73], dirty, null));
    				}
    			}
    		},
    		i(local) {
    			if (current) return;
    			transition_in(static_slot, local);
    			transition_in(default_slot, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(static_slot, local);
    			transition_out(default_slot, local);
    			current = false;
    		},
    		d(detaching) {
    			if (static_slot) static_slot.d(detaching);
    			if (detaching) detach(t);
    			if (default_slot) default_slot.d(detaching);
    		}
    	};
    }

    // (327:2) {#if pageContent}
    function create_if_block$b(ctx) {
    	let current;

    	const pagecontent = new Page_content({
    			props: {
    				ptr: /*ptr*/ ctx[2],
    				ptrDistance: /*ptrDistance*/ ctx[3],
    				ptrPreloader: /*ptrPreloader*/ ctx[4],
    				ptrBottom: /*ptrBottom*/ ctx[5],
    				ptrMousewheel: /*ptrMousewheel*/ ctx[6],
    				infinite: /*infinite*/ ctx[7],
    				infiniteTop: /*infiniteTop*/ ctx[8],
    				infiniteDistance: /*infiniteDistance*/ ctx[9],
    				infinitePreloader: /*infinitePreloader*/ ctx[10],
    				hideBarsOnScroll: /*hideBarsOnScroll*/ ctx[11],
    				hideNavbarOnScroll: /*hideNavbarOnScroll*/ ctx[12],
    				hideToolbarOnScroll: /*hideToolbarOnScroll*/ ctx[13],
    				messagesContent: /*messagesContent*/ ctx[14],
    				loginScreen: /*loginScreen*/ ctx[15],
    				onPtrPullStart: /*onPtrPullStart*/ ctx[18],
    				onPtrPullMove: /*onPtrPullMove*/ ctx[19],
    				onPtrPullEnd: /*onPtrPullEnd*/ ctx[20],
    				onPtrRefresh: /*onPtrRefresh*/ ctx[21],
    				onPtrDone: /*onPtrDone*/ ctx[22],
    				onInfinite: /*onInfinite*/ ctx[23],
    				$$slots: { default: [create_default_slot$3] },
    				$$scope: { ctx }
    			}
    		});

    	return {
    		c() {
    			create_component(pagecontent.$$.fragment);
    		},
    		m(target, anchor) {
    			mount_component(pagecontent, target, anchor);
    			current = true;
    		},
    		p(ctx, dirty) {
    			const pagecontent_changes = {};
    			if (dirty[0] & /*ptr*/ 4) pagecontent_changes.ptr = /*ptr*/ ctx[2];
    			if (dirty[0] & /*ptrDistance*/ 8) pagecontent_changes.ptrDistance = /*ptrDistance*/ ctx[3];
    			if (dirty[0] & /*ptrPreloader*/ 16) pagecontent_changes.ptrPreloader = /*ptrPreloader*/ ctx[4];
    			if (dirty[0] & /*ptrBottom*/ 32) pagecontent_changes.ptrBottom = /*ptrBottom*/ ctx[5];
    			if (dirty[0] & /*ptrMousewheel*/ 64) pagecontent_changes.ptrMousewheel = /*ptrMousewheel*/ ctx[6];
    			if (dirty[0] & /*infinite*/ 128) pagecontent_changes.infinite = /*infinite*/ ctx[7];
    			if (dirty[0] & /*infiniteTop*/ 256) pagecontent_changes.infiniteTop = /*infiniteTop*/ ctx[8];
    			if (dirty[0] & /*infiniteDistance*/ 512) pagecontent_changes.infiniteDistance = /*infiniteDistance*/ ctx[9];
    			if (dirty[0] & /*infinitePreloader*/ 1024) pagecontent_changes.infinitePreloader = /*infinitePreloader*/ ctx[10];
    			if (dirty[0] & /*hideBarsOnScroll*/ 2048) pagecontent_changes.hideBarsOnScroll = /*hideBarsOnScroll*/ ctx[11];
    			if (dirty[0] & /*hideNavbarOnScroll*/ 4096) pagecontent_changes.hideNavbarOnScroll = /*hideNavbarOnScroll*/ ctx[12];
    			if (dirty[0] & /*hideToolbarOnScroll*/ 8192) pagecontent_changes.hideToolbarOnScroll = /*hideToolbarOnScroll*/ ctx[13];
    			if (dirty[0] & /*messagesContent*/ 16384) pagecontent_changes.messagesContent = /*messagesContent*/ ctx[14];
    			if (dirty[0] & /*loginScreen*/ 32768) pagecontent_changes.loginScreen = /*loginScreen*/ ctx[15];

    			if (dirty[2] & /*$$scope*/ 2048) {
    				pagecontent_changes.$$scope = { dirty, ctx };
    			}

    			pagecontent.$set(pagecontent_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(pagecontent.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(pagecontent.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			destroy_component(pagecontent, detaching);
    		}
    	};
    }

    // (328:2) <PageContent     ptr={ptr}     ptrDistance={ptrDistance}     ptrPreloader={ptrPreloader}     ptrBottom={ptrBottom}     ptrMousewheel={ptrMousewheel}     infinite={infinite}     infiniteTop={infiniteTop}     infiniteDistance={infiniteDistance}     infinitePreloader={infinitePreloader}     hideBarsOnScroll={hideBarsOnScroll}     hideNavbarOnScroll={hideNavbarOnScroll}     hideToolbarOnScroll={hideToolbarOnScroll}     messagesContent={messagesContent}     loginScreen={loginScreen}     onPtrPullStart={onPtrPullStart}     onPtrPullMove={onPtrPullMove}     onPtrPullEnd={onPtrPullEnd}     onPtrRefresh={onPtrRefresh}     onPtrDone={onPtrDone}     onInfinite={onInfinite}   >
    function create_default_slot$3(ctx) {
    	let t;
    	let current;
    	const static_slot_template = /*$$slots*/ ctx[71].static;
    	const static_slot = create_slot(static_slot_template, ctx, /*$$scope*/ ctx[73], get_static_slot_context);
    	const default_slot_template = /*$$slots*/ ctx[71].default;
    	const default_slot = create_slot(default_slot_template, ctx, /*$$scope*/ ctx[73], null);

    	return {
    		c() {
    			if (static_slot) static_slot.c();
    			t = space();
    			if (default_slot) default_slot.c();
    		},
    		m(target, anchor) {
    			if (static_slot) {
    				static_slot.m(target, anchor);
    			}

    			insert(target, t, anchor);

    			if (default_slot) {
    				default_slot.m(target, anchor);
    			}

    			current = true;
    		},
    		p(ctx, dirty) {
    			if (static_slot) {
    				if (static_slot.p && dirty[2] & /*$$scope*/ 2048) {
    					static_slot.p(get_slot_context(static_slot_template, ctx, /*$$scope*/ ctx[73], get_static_slot_context), get_slot_changes(static_slot_template, /*$$scope*/ ctx[73], dirty, get_static_slot_changes));
    				}
    			}

    			if (default_slot) {
    				if (default_slot.p && dirty[2] & /*$$scope*/ 2048) {
    					default_slot.p(get_slot_context(default_slot_template, ctx, /*$$scope*/ ctx[73], null), get_slot_changes(default_slot_template, /*$$scope*/ ctx[73], dirty, null));
    				}
    			}
    		},
    		i(local) {
    			if (current) return;
    			transition_in(static_slot, local);
    			transition_in(default_slot, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(static_slot, local);
    			transition_out(default_slot, local);
    			current = false;
    		},
    		d(detaching) {
    			if (static_slot) static_slot.d(detaching);
    			if (detaching) detach(t);
    			if (default_slot) default_slot.d(detaching);
    		}
    	};
    }

    function create_fragment$n(ctx) {
    	let div;
    	let t;
    	let current_block_type_index;
    	let if_block;
    	let current;
    	const fixed_slot_template = /*$$slots*/ ctx[71].fixed;
    	const fixed_slot = create_slot(fixed_slot_template, ctx, /*$$scope*/ ctx[73], get_fixed_slot_context);
    	const if_block_creators = [create_if_block$b, create_else_block$2];
    	const if_blocks = [];

    	function select_block_type(ctx, dirty) {
    		if (/*pageContent*/ ctx[1]) return 0;
    		return 1;
    	}

    	current_block_type_index = select_block_type(ctx);
    	if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);

    	let div_levels = [
    		{ class: /*classes*/ ctx[17] },
    		{ "data-name": /*name*/ ctx[0] },
    		restProps(/*$$restProps*/ ctx[24])
    	];

    	let div_data = {};

    	for (let i = 0; i < div_levels.length; i += 1) {
    		div_data = assign(div_data, div_levels[i]);
    	}

    	return {
    		c() {
    			div = element("div");
    			if (fixed_slot) fixed_slot.c();
    			t = space();
    			if_block.c();
    			set_attributes(div, div_data);
    		},
    		m(target, anchor) {
    			insert(target, div, anchor);

    			if (fixed_slot) {
    				fixed_slot.m(div, null);
    			}

    			append(div, t);
    			if_blocks[current_block_type_index].m(div, null);
    			/*div_binding*/ ctx[72](div);
    			current = true;
    		},
    		p(ctx, dirty) {
    			if (fixed_slot) {
    				if (fixed_slot.p && dirty[2] & /*$$scope*/ 2048) {
    					fixed_slot.p(get_slot_context(fixed_slot_template, ctx, /*$$scope*/ ctx[73], get_fixed_slot_context), get_slot_changes(fixed_slot_template, /*$$scope*/ ctx[73], dirty, get_fixed_slot_changes));
    				}
    			}

    			let previous_block_index = current_block_type_index;
    			current_block_type_index = select_block_type(ctx);

    			if (current_block_type_index === previous_block_index) {
    				if_blocks[current_block_type_index].p(ctx, dirty);
    			} else {
    				group_outros();

    				transition_out(if_blocks[previous_block_index], 1, 1, () => {
    					if_blocks[previous_block_index] = null;
    				});

    				check_outros();
    				if_block = if_blocks[current_block_type_index];

    				if (!if_block) {
    					if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);
    					if_block.c();
    				}

    				transition_in(if_block, 1);
    				if_block.m(div, null);
    			}

    			set_attributes(div, get_spread_update(div_levels, [
    				dirty[0] & /*classes*/ 131072 && { class: /*classes*/ ctx[17] },
    				dirty[0] & /*name*/ 1 && { "data-name": /*name*/ ctx[0] },
    				dirty[0] & /*$$restProps*/ 16777216 && restProps(/*$$restProps*/ ctx[24])
    			]));
    		},
    		i(local) {
    			if (current) return;
    			transition_in(fixed_slot, local);
    			transition_in(if_block);
    			current = true;
    		},
    		o(local) {
    			transition_out(fixed_slot, local);
    			transition_out(if_block);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(div);
    			if (fixed_slot) fixed_slot.d(detaching);
    			if_blocks[current_block_type_index].d();
    			/*div_binding*/ ctx[72](null);
    		}
    	};
    }

    function instance$i($$self, $$props, $$invalidate) {
    	const omit_props_names = [
    		"name","stacked","withSubnavbar","subnavbar","withNavbarLarge","navbarLarge","noNavbar","noToolbar","tabs","pageContent","noSwipeback","ptr","ptrDistance","ptrPreloader","ptrBottom","ptrMousewheel","infinite","infiniteTop","infiniteDistance","infinitePreloader","hideBarsOnScroll","hideNavbarOnScroll","hideToolbarOnScroll","messagesContent","loginScreen","class"
    	];

    	let $$restProps = compute_rest_props($$props, omit_props_names);
    	const dispatch = createEventDispatcher();
    	let { name = undefined } = $$props;
    	let { stacked = undefined } = $$props;
    	let { withSubnavbar = undefined } = $$props;
    	let { subnavbar = undefined } = $$props;
    	let { withNavbarLarge = undefined } = $$props;
    	let { navbarLarge = undefined } = $$props;
    	let { noNavbar = undefined } = $$props;
    	let { noToolbar = undefined } = $$props;
    	let { tabs = undefined } = $$props;
    	let { pageContent = true } = $$props;
    	let { noSwipeback = undefined } = $$props;
    	let { ptr = undefined } = $$props;
    	let { ptrDistance = undefined } = $$props;
    	let { ptrPreloader = true } = $$props;
    	let { ptrBottom = undefined } = $$props;
    	let { ptrMousewheel = undefined } = $$props;
    	let { infinite = undefined } = $$props;
    	let { infiniteTop = undefined } = $$props;
    	let { infiniteDistance = undefined } = $$props;
    	let { infinitePreloader = true } = $$props;
    	let { hideBarsOnScroll = undefined } = $$props;
    	let { hideNavbarOnScroll = undefined } = $$props;
    	let { hideToolbarOnScroll = undefined } = $$props;
    	let { messagesContent = undefined } = $$props;
    	let { loginScreen = undefined } = $$props;
    	let { class: className = undefined } = $$props;

    	// State
    	let el;

    	let hasSubnavbar = false;
    	let hasNavbarLarge = false;
    	let hasNavbarLargeCollapsed = false;
    	let hasCardExpandableOpened = false;
    	let routerPositionClass = "";
    	let routerForceUnstack = false;
    	let routerPageRole = null;
    	let routerPageRoleDetailRoot = false;
    	let routerPageMasterStack = false;

    	// Handlers
    	function onPtrPullStart() {
    		dispatch("ptrPullStart");
    		if (typeof $$props.onPtrPullStart === "function") $$props.onPtrPullStart();
    	}

    	function onPtrPullMove() {
    		dispatch("ptrPullMove");
    		if (typeof $$props.onPtrPullMove === "function") $$props.onPtrPullMove();
    	}

    	function onPtrPullEnd() {
    		dispatch("ptrPullEnd");
    		if (typeof $$props.onPtrPullEnd === "function") $$props.onPtrPullEnd();
    	}

    	function onPtrRefresh(done) {
    		dispatch("ptrRefresh", [done]);
    		if (typeof $$props.onPtrRefresh === "function") $$props.onPtrRefresh(done);
    	}

    	function onPtrDone() {
    		dispatch("ptrDone");
    		if (typeof $$props.onPtrDone === "function") $$props.onPtrDone();
    	}

    	function onInfinite() {
    		dispatch("infinite");
    		if (typeof $$props.onInfinite === "function") $$props.onInfinite();
    	}

    	// Main Page Events
    	function onPageMounted(page) {
    		if (el !== page.el) return;
    		dispatch("pageMounted", [page]);
    		if (typeof $$props.onPageMounted === "function") $$props.onPageMounted(page);
    	}

    	function onPageInit(page) {
    		if (el !== page.el) return;

    		if (typeof withSubnavbar === "undefined" && typeof subnavbar === "undefined") {
    			if (page.$navbarEl && page.$navbarEl.length && page.$navbarEl.find(".subnavbar").length || page.$el.children(".navbar").find(".subnavbar").length) {
    				$$invalidate(35, hasSubnavbar = true);
    			}
    		}

    		if (typeof withNavbarLarge === "undefined" && typeof navbarLarge === "undefined") {
    			if (page.$navbarEl && page.$navbarEl.hasClass("navbar-large") || page.$el.children(".navbar-large").length) {
    				$$invalidate(36, hasNavbarLarge = true);
    			}
    		}

    		dispatch("pageInit", [page]);
    		if (typeof $$props.onPageInit === "function") $$props.onPageInit(page);
    	}

    	function onPageReinit(page) {
    		if (el !== page.el) return;
    		dispatch("pageReinit", [page]);
    		if (typeof $$props.onPageReinit === "function") $$props.onPageReinit(page);
    	}

    	function onPageBeforeIn(page) {
    		if (el !== page.el) return;

    		if (!page.swipeBack) {
    			if (page.from === "next") {
    				$$invalidate(39, routerPositionClass = "page-next");
    			}

    			if (page.from === "previous") {
    				$$invalidate(39, routerPositionClass = "page-previous");
    			}
    		}

    		dispatch("pageBeforeIn", [page]);
    		if (typeof $$props.onPageBeforeIn === "function") $$props.onPageBeforeIn(page);
    	}

    	function onPageBeforeOut(page) {
    		if (el !== page.el) return;
    		dispatch("pageBeforeOut", [page]);
    		if (typeof $$props.onPageBeforeOut === "function") $$props.onPageBeforeOut(page);
    	}

    	function onPageAfterOut(page) {
    		if (el !== page.el) return;

    		if (page.to === "next") {
    			$$invalidate(39, routerPositionClass = "page-next");
    		}

    		if (page.to === "previous") {
    			$$invalidate(39, routerPositionClass = "page-previous");
    		}

    		dispatch("pageAfterOut", [page]);
    		if (typeof $$props.onPageAfterOut === "function") $$props.onPageAfterOut(page);
    	}

    	function onPageAfterIn(page) {
    		if (el !== page.el) return;
    		$$invalidate(39, routerPositionClass = "page-current");
    		dispatch("pageAfterIn", [page]);
    		if (typeof $$props.onPageAfterIn === "function") $$props.onPageAfterIn(page);
    	}

    	function onPageBeforeRemove(page) {
    		if (el !== page.el) return;

    		if (page.$navbarEl && page.$navbarEl[0] && page.$navbarEl.parent()[0] && page.$navbarEl.parent()[0] !== el) {
    			page.$el.prepend(page.$navbarEl);
    		}

    		dispatch("pageBeforeRemove", [page]);
    		if (typeof $$props.onPageBeforeRemove === "function") $$props.onPageBeforeRemove(page);
    	}

    	function onPageBeforeUnmount(page) {
    		if (el !== page.el) return;
    		dispatch("pageBeforeUnmount", [page]);
    		if (typeof $$props.onPageBeforeUnmount === "function") $$props.onPageBeforeUnmount(page);
    	}

    	// Helper events
    	function onPageStack(pageEl) {
    		if (el !== pageEl) return;
    		$$invalidate(40, routerForceUnstack = false);
    	}

    	function onPageUnstack(pageEl) {
    		if (el !== pageEl) return;
    		$$invalidate(40, routerForceUnstack = true);
    	}

    	function onPagePosition(pageEl, position) {
    		if (el !== pageEl) return;
    		$$invalidate(39, routerPositionClass = `page-${position}`);
    	}

    	function onPageRole(pageEl, rolesData) {
    		if (el !== pageEl) return;
    		$$invalidate(41, routerPageRole = rolesData.role);
    		$$invalidate(42, routerPageRoleDetailRoot = rolesData.detailRoot);
    	}

    	function onPageMasterStack(pageEl) {
    		if (el !== pageEl) return;
    		$$invalidate(43, routerPageMasterStack = true);
    	}

    	function onPageMasterUnstack(pageEl) {
    		if (el !== pageEl) return;
    		$$invalidate(43, routerPageMasterStack = false);
    	}

    	function onPageNavbarLargeCollapsed(pageEl) {
    		if (el !== pageEl) return;
    		$$invalidate(37, hasNavbarLargeCollapsed = true);
    	}

    	function onPageNavbarLargeExpanded(pageEl) {
    		if (el !== pageEl) return;
    		$$invalidate(37, hasNavbarLargeCollapsed = false);
    	}

    	function onCardOpened(cardEl, pageEl) {
    		if (el !== pageEl) return;
    		$$invalidate(38, hasCardExpandableOpened = true);
    	}

    	function onCardClose(cardEl, pageEl) {
    		if (el !== pageEl) return;
    		$$invalidate(38, hasCardExpandableOpened = false);
    	}

    	function onPageTabShow(pageEl) {
    		if (el !== pageEl) return;
    		dispatch("pageTabShow");
    		if (typeof $$props.onPageTabShow === "function") $$props.onPageTabShow();
    	}

    	function onPageTabHide(pageEl) {
    		if (el !== pageEl) return;
    		dispatch("pageTabHide");
    		if (typeof $$props.onPageTabHide === "function") $$props.onPageTabHide();
    	}

    	// Mount/destroy
    	function mountPage() {
    		f7.instance.on("pageMounted", onPageMounted);
    		f7.instance.on("pageInit", onPageInit);
    		f7.instance.on("pageReinit", onPageReinit);
    		f7.instance.on("pageBeforeIn", onPageBeforeIn);
    		f7.instance.on("pageBeforeOut", onPageBeforeOut);
    		f7.instance.on("pageAfterOut", onPageAfterOut);
    		f7.instance.on("pageAfterIn", onPageAfterIn);
    		f7.instance.on("pageBeforeRemove", onPageBeforeRemove);
    		f7.instance.on("pageBeforeUnmount", onPageBeforeUnmount);
    		f7.instance.on("pageStack", onPageStack);
    		f7.instance.on("pageUnstack", onPageUnstack);
    		f7.instance.on("pagePosition", onPagePosition);
    		f7.instance.on("pageRole", onPageRole);
    		f7.instance.on("pageMasterStack", onPageMasterStack);
    		f7.instance.on("pageMasterUnstack", onPageMasterUnstack);
    		f7.instance.on("pageNavbarLargeCollapsed", onPageNavbarLargeCollapsed);
    		f7.instance.on("pageNavbarLargeExpanded", onPageNavbarLargeExpanded);
    		f7.instance.on("cardOpened", onCardOpened);
    		f7.instance.on("cardClose", onCardClose);
    		f7.instance.on("pageTabShow", onPageTabShow);
    		f7.instance.on("pageTabHide", onPageTabHide);
    	}

    	function destroyPage() {
    		f7.instance.off("pageMounted", onPageMounted);
    		f7.instance.off("pageInit", onPageInit);
    		f7.instance.off("pageReinit", onPageReinit);
    		f7.instance.off("pageBeforeIn", onPageBeforeIn);
    		f7.instance.off("pageBeforeOut", onPageBeforeOut);
    		f7.instance.off("pageAfterOut", onPageAfterOut);
    		f7.instance.off("pageAfterIn", onPageAfterIn);
    		f7.instance.off("pageBeforeRemove", onPageBeforeRemove);
    		f7.instance.off("pageBeforeUnmount", onPageBeforeUnmount);
    		f7.instance.off("pageStack", onPageStack);
    		f7.instance.off("pageUnstack", onPageUnstack);
    		f7.instance.off("pagePosition", onPagePosition);
    		f7.instance.off("pageRole", onPageRole);
    		f7.instance.off("pageMasterStack", onPageMasterStack);
    		f7.instance.off("pageMasterUnstack", onPageMasterUnstack);
    		f7.instance.off("pageNavbarLargeCollapsed", onPageNavbarLargeCollapsed);
    		f7.instance.off("pageNavbarLargeExpanded", onPageNavbarLargeExpanded);
    		f7.instance.off("cardOpened", onCardOpened);
    		f7.instance.off("cardClose", onCardClose);
    		f7.instance.off("pageTabShow", onPageTabShow);
    		f7.instance.off("pageTabHide", onPageTabHide);
    	}

    	onMount(() => {
    		f7.ready(() => {
    			if (el) {
    				const dom7 = f7.instance.$;
    				const fixedEls = dom7(el).children(".page-content").children("[data-f7-slot=\"fixed\"]");

    				if (fixedEls.length) {
    					for (let i = fixedEls.length - 1; i >= 0; i -= 1) {
    						dom7(el).prepend(fixedEls[i]);
    					}
    				}
    			}

    			mountPage();
    		});
    	});

    	afterUpdate(() => {
    		if (el && f7.instance) {
    			const dom7 = f7.instance.$;
    			const fixedEls = dom7(el).children(".page-content").children("[data-f7-slot=\"fixed\"]");

    			if (fixedEls.length) {
    				for (let i = fixedEls.length - 1; i >= 0; i -= 1) {
    					dom7(el).prepend(fixedEls[i]);
    				}
    			}
    		}
    	});

    	onDestroy(() => {
    		if (!f7.instance) return;
    		destroyPage();
    	});

    	let { $$slots = {}, $$scope } = $$props;

    	function div_binding($$value) {
    		binding_callbacks[$$value ? "unshift" : "push"](() => {
    			$$invalidate(16, el = $$value);
    		});
    	}

    	$$self.$set = $$new_props => {
    		$$invalidate(70, $$props = assign(assign({}, $$props), exclude_internal_props($$new_props)));
    		$$invalidate(24, $$restProps = compute_rest_props($$props, omit_props_names));
    		if ("name" in $$new_props) $$invalidate(0, name = $$new_props.name);
    		if ("stacked" in $$new_props) $$invalidate(25, stacked = $$new_props.stacked);
    		if ("withSubnavbar" in $$new_props) $$invalidate(26, withSubnavbar = $$new_props.withSubnavbar);
    		if ("subnavbar" in $$new_props) $$invalidate(27, subnavbar = $$new_props.subnavbar);
    		if ("withNavbarLarge" in $$new_props) $$invalidate(28, withNavbarLarge = $$new_props.withNavbarLarge);
    		if ("navbarLarge" in $$new_props) $$invalidate(29, navbarLarge = $$new_props.navbarLarge);
    		if ("noNavbar" in $$new_props) $$invalidate(30, noNavbar = $$new_props.noNavbar);
    		if ("noToolbar" in $$new_props) $$invalidate(31, noToolbar = $$new_props.noToolbar);
    		if ("tabs" in $$new_props) $$invalidate(32, tabs = $$new_props.tabs);
    		if ("pageContent" in $$new_props) $$invalidate(1, pageContent = $$new_props.pageContent);
    		if ("noSwipeback" in $$new_props) $$invalidate(33, noSwipeback = $$new_props.noSwipeback);
    		if ("ptr" in $$new_props) $$invalidate(2, ptr = $$new_props.ptr);
    		if ("ptrDistance" in $$new_props) $$invalidate(3, ptrDistance = $$new_props.ptrDistance);
    		if ("ptrPreloader" in $$new_props) $$invalidate(4, ptrPreloader = $$new_props.ptrPreloader);
    		if ("ptrBottom" in $$new_props) $$invalidate(5, ptrBottom = $$new_props.ptrBottom);
    		if ("ptrMousewheel" in $$new_props) $$invalidate(6, ptrMousewheel = $$new_props.ptrMousewheel);
    		if ("infinite" in $$new_props) $$invalidate(7, infinite = $$new_props.infinite);
    		if ("infiniteTop" in $$new_props) $$invalidate(8, infiniteTop = $$new_props.infiniteTop);
    		if ("infiniteDistance" in $$new_props) $$invalidate(9, infiniteDistance = $$new_props.infiniteDistance);
    		if ("infinitePreloader" in $$new_props) $$invalidate(10, infinitePreloader = $$new_props.infinitePreloader);
    		if ("hideBarsOnScroll" in $$new_props) $$invalidate(11, hideBarsOnScroll = $$new_props.hideBarsOnScroll);
    		if ("hideNavbarOnScroll" in $$new_props) $$invalidate(12, hideNavbarOnScroll = $$new_props.hideNavbarOnScroll);
    		if ("hideToolbarOnScroll" in $$new_props) $$invalidate(13, hideToolbarOnScroll = $$new_props.hideToolbarOnScroll);
    		if ("messagesContent" in $$new_props) $$invalidate(14, messagesContent = $$new_props.messagesContent);
    		if ("loginScreen" in $$new_props) $$invalidate(15, loginScreen = $$new_props.loginScreen);
    		if ("class" in $$new_props) $$invalidate(34, className = $$new_props.class);
    		if ("$$scope" in $$new_props) $$invalidate(73, $$scope = $$new_props.$$scope);
    	};

    	let forceSubnavbar;
    	let forceNavbarLarge;
    	let classes;

    	$$self.$$.update = () => {
    		if ($$self.$$.dirty[0] & /*subnavbar, withSubnavbar*/ 201326592 | $$self.$$.dirty[1] & /*hasSubnavbar*/ 16) {
    			 $$invalidate(44, forceSubnavbar = typeof subnavbar === "undefined" && typeof withSubnavbar === "undefined"
    			? hasSubnavbar
    			: false);
    		}

    		if ($$self.$$.dirty[0] & /*navbarLarge, withNavbarLarge*/ 805306368 | $$self.$$.dirty[1] & /*hasNavbarLarge*/ 32) {
    			 $$invalidate(45, forceNavbarLarge = typeof navbarLarge === "undefined" && typeof withNavbarLarge === "undefined"
    			? hasNavbarLarge
    			: false);
    		}

    		 $$invalidate(17, classes = Utils.classNames(
    			className,
    			"page",
    			routerPositionClass,
    			{
    				stacked: stacked && !routerForceUnstack,
    				tabs,
    				"page-with-subnavbar": subnavbar || withSubnavbar || forceSubnavbar,
    				"page-with-navbar-large": navbarLarge || withNavbarLarge || forceNavbarLarge,
    				"no-navbar": noNavbar,
    				"no-toolbar": noToolbar,
    				"no-swipeback": noSwipeback,
    				"page-master": routerPageRole === "master",
    				"page-master-detail": routerPageRole === "detail",
    				"page-master-detail-root": routerPageRoleDetailRoot === true,
    				"page-master-stacked": routerPageMasterStack === true,
    				"page-with-navbar-large-collapsed": hasNavbarLargeCollapsed === true,
    				"page-with-card-opened": hasCardExpandableOpened === true,
    				"login-screen-page": loginScreen
    			},
    			Mixins.colorClasses($$props)
    		));
    	};

    	$$props = exclude_internal_props($$props);

    	return [
    		name,
    		pageContent,
    		ptr,
    		ptrDistance,
    		ptrPreloader,
    		ptrBottom,
    		ptrMousewheel,
    		infinite,
    		infiniteTop,
    		infiniteDistance,
    		infinitePreloader,
    		hideBarsOnScroll,
    		hideNavbarOnScroll,
    		hideToolbarOnScroll,
    		messagesContent,
    		loginScreen,
    		el,
    		classes,
    		onPtrPullStart,
    		onPtrPullMove,
    		onPtrPullEnd,
    		onPtrRefresh,
    		onPtrDone,
    		onInfinite,
    		$$restProps,
    		stacked,
    		withSubnavbar,
    		subnavbar,
    		withNavbarLarge,
    		navbarLarge,
    		noNavbar,
    		noToolbar,
    		tabs,
    		noSwipeback,
    		className,
    		hasSubnavbar,
    		hasNavbarLarge,
    		hasNavbarLargeCollapsed,
    		hasCardExpandableOpened,
    		routerPositionClass,
    		routerForceUnstack,
    		routerPageRole,
    		routerPageRoleDetailRoot,
    		routerPageMasterStack,
    		forceSubnavbar,
    		forceNavbarLarge,
    		dispatch,
    		onPageMounted,
    		onPageInit,
    		onPageReinit,
    		onPageBeforeIn,
    		onPageBeforeOut,
    		onPageAfterOut,
    		onPageAfterIn,
    		onPageBeforeRemove,
    		onPageBeforeUnmount,
    		onPageStack,
    		onPageUnstack,
    		onPagePosition,
    		onPageRole,
    		onPageMasterStack,
    		onPageMasterUnstack,
    		onPageNavbarLargeCollapsed,
    		onPageNavbarLargeExpanded,
    		onCardOpened,
    		onCardClose,
    		onPageTabShow,
    		onPageTabHide,
    		mountPage,
    		destroyPage,
    		$$props,
    		$$slots,
    		div_binding,
    		$$scope
    	];
    }

    class Page extends SvelteComponent {
    	constructor(options) {
    		super();

    		init(
    			this,
    			options,
    			instance$i,
    			create_fragment$n,
    			safe_not_equal,
    			{
    				name: 0,
    				stacked: 25,
    				withSubnavbar: 26,
    				subnavbar: 27,
    				withNavbarLarge: 28,
    				navbarLarge: 29,
    				noNavbar: 30,
    				noToolbar: 31,
    				tabs: 32,
    				pageContent: 1,
    				noSwipeback: 33,
    				ptr: 2,
    				ptrDistance: 3,
    				ptrPreloader: 4,
    				ptrBottom: 5,
    				ptrMousewheel: 6,
    				infinite: 7,
    				infiniteTop: 8,
    				infiniteDistance: 9,
    				infinitePreloader: 10,
    				hideBarsOnScroll: 11,
    				hideNavbarOnScroll: 12,
    				hideToolbarOnScroll: 13,
    				messagesContent: 14,
    				loginScreen: 15,
    				class: 34
    			},
    			[-1, -1, -1]
    		);
    	}
    }

    /* public/packages/svelte/components/view.svelte generated by Svelte v3.22.3 */

    function get_each_context$1(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[27] = list[i];
    	return child_ctx;
    }

    // (141:2) {#each pages as page (page.id)}
    function create_each_block$1(key_1, ctx) {
    	let first;
    	let switch_instance_anchor;
    	let current;
    	const switch_instance_spread_levels = [/*page*/ ctx[27].props];
    	var switch_value = /*page*/ ctx[27].component;

    	function switch_props(ctx) {
    		let switch_instance_props = {};

    		for (let i = 0; i < switch_instance_spread_levels.length; i += 1) {
    			switch_instance_props = assign(switch_instance_props, switch_instance_spread_levels[i]);
    		}

    		return { props: switch_instance_props };
    	}

    	if (switch_value) {
    		var switch_instance = new switch_value(switch_props());
    	}

    	return {
    		key: key_1,
    		first: null,
    		c() {
    			first = empty();
    			if (switch_instance) create_component(switch_instance.$$.fragment);
    			switch_instance_anchor = empty();
    			this.first = first;
    		},
    		m(target, anchor) {
    			insert(target, first, anchor);

    			if (switch_instance) {
    				mount_component(switch_instance, target, anchor);
    			}

    			insert(target, switch_instance_anchor, anchor);
    			current = true;
    		},
    		p(ctx, dirty) {
    			const switch_instance_changes = (dirty & /*pages*/ 8)
    			? get_spread_update(switch_instance_spread_levels, [get_spread_object(/*page*/ ctx[27].props)])
    			: {};

    			if (switch_value !== (switch_value = /*page*/ ctx[27].component)) {
    				if (switch_instance) {
    					group_outros();
    					const old_component = switch_instance;

    					transition_out(old_component.$$.fragment, 1, 0, () => {
    						destroy_component(old_component, 1);
    					});

    					check_outros();
    				}

    				if (switch_value) {
    					switch_instance = new switch_value(switch_props());
    					create_component(switch_instance.$$.fragment);
    					transition_in(switch_instance.$$.fragment, 1);
    					mount_component(switch_instance, switch_instance_anchor.parentNode, switch_instance_anchor);
    				} else {
    					switch_instance = null;
    				}
    			} else if (switch_value) {
    				switch_instance.$set(switch_instance_changes);
    			}
    		},
    		i(local) {
    			if (current) return;
    			if (switch_instance) transition_in(switch_instance.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			if (switch_instance) transition_out(switch_instance.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(first);
    			if (detaching) detach(switch_instance_anchor);
    			if (switch_instance) destroy_component(switch_instance, detaching);
    		}
    	};
    }

    function create_fragment$o(ctx) {
    	let div;
    	let t;
    	let each_blocks = [];
    	let each_1_lookup = new Map();
    	let current;
    	const default_slot_template = /*$$slots*/ ctx[25].default;
    	const default_slot = create_slot(default_slot_template, ctx, /*$$scope*/ ctx[24], null);
    	let each_value = /*pages*/ ctx[3];
    	const get_key = ctx => /*page*/ ctx[27].id;

    	for (let i = 0; i < each_value.length; i += 1) {
    		let child_ctx = get_each_context$1(ctx, each_value, i);
    		let key = get_key(child_ctx);
    		each_1_lookup.set(key, each_blocks[i] = create_each_block$1(key, child_ctx));
    	}

    	return {
    		c() {
    			div = element("div");
    			if (default_slot) default_slot.c();
    			t = space();

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			attr(div, "class", /*classes*/ ctx[4]);
    			attr(div, "style", /*style*/ ctx[1]);
    			attr(div, "id", /*id*/ ctx[0]);
    		},
    		m(target, anchor) {
    			insert(target, div, anchor);

    			if (default_slot) {
    				default_slot.m(div, null);
    			}

    			append(div, t);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].m(div, null);
    			}

    			/*div_binding*/ ctx[26](div);
    			current = true;
    		},
    		p(ctx, [dirty]) {
    			if (default_slot) {
    				if (default_slot.p && dirty & /*$$scope*/ 16777216) {
    					default_slot.p(get_slot_context(default_slot_template, ctx, /*$$scope*/ ctx[24], null), get_slot_changes(default_slot_template, /*$$scope*/ ctx[24], dirty, null));
    				}
    			}

    			if (dirty & /*pages*/ 8) {
    				const each_value = /*pages*/ ctx[3];
    				group_outros();
    				each_blocks = update_keyed_each(each_blocks, dirty, get_key, 1, ctx, each_value, each_1_lookup, div, outro_and_destroy_block, create_each_block$1, null, get_each_context$1);
    				check_outros();
    			}

    			if (!current || dirty & /*classes*/ 16) {
    				attr(div, "class", /*classes*/ ctx[4]);
    			}

    			if (!current || dirty & /*style*/ 2) {
    				attr(div, "style", /*style*/ ctx[1]);
    			}

    			if (!current || dirty & /*id*/ 1) {
    				attr(div, "id", /*id*/ ctx[0]);
    			}
    		},
    		i(local) {
    			if (current) return;
    			transition_in(default_slot, local);

    			for (let i = 0; i < each_value.length; i += 1) {
    				transition_in(each_blocks[i]);
    			}

    			current = true;
    		},
    		o(local) {
    			transition_out(default_slot, local);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				transition_out(each_blocks[i]);
    			}

    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(div);
    			if (default_slot) default_slot.d(detaching);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].d();
    			}

    			/*div_binding*/ ctx[26](null);
    		}
    	};
    }

    function instance_1$5($$self, $$props, $$invalidate) {
    	let { id = undefined } = $$props;
    	let { style = undefined } = $$props;
    	let { init = true } = $$props;
    	let { class: className = undefined } = $$props;
    	const dispatch = createEventDispatcher();
    	const { main, tab, tabActive } = $$props;
    	let el;
    	let pages = [];
    	let routerData;
    	let f7View;

    	function instance() {
    		return f7View;
    	}

    	function onResize(view, width) {
    		dispatch("viewResize", [width]);
    		if (typeof $$props.onViewResize === "function") $$props.onViewResize(width);
    	}

    	function onSwipeBackMove(data) {
    		dispatch("swipeBackMove", [data]);
    		if (typeof $$props.onSwipeBackMove === "function") $$props.onSwipeBackMove(data);
    	}

    	function onSwipeBackBeforeChange(data) {
    		dispatch("swipeBackBeforeChange", [data]);
    		if (typeof $$props.onSwipeBackBeforeChange === "function") $$props.onSwipeBackBeforeChange(data);
    	}

    	function onSwipeBackAfterChange(data) {
    		dispatch("swipeBackAfterChange", [data]);
    		if (typeof $$props.onSwipeBackAfterChange === "function") $$props.onSwipeBackAfterChange(data);
    	}

    	function onSwipeBackBeforeReset(data) {
    		dispatch("swipeBackBeforeReset", [data]);
    		if (typeof $$props.onSwipeBackBeforeReset === "function") $$props.onSwipeBackBeforeReset(data);
    	}

    	function onSwipeBackAfterReset(data) {
    		dispatch("swipeBackAfterReset", [data]);
    		if (typeof $$props.onSwipeBackAfterReset === "function") $$props.onSwipeBackAfterReset(data);
    	}

    	function onTabShow(tabEl) {
    		if (el !== tabEl) return;
    		dispatch("tabShow");
    		if (typeof $$props.onTabShow === "function") $$props.onTabShow(tabEl);
    	}

    	function onTabHide(tabEl) {
    		if (el !== tabEl) return;
    		dispatch("tabHide");
    		if (typeof $$props.onTabHide === "function") $$props.onTabHide(tabEl);
    	}

    	function onViewInit(view) {
    		f7View = view;
    		routerData.instance = view;
    		dispatch("viewInit", [view]);
    		if (typeof $$props.onViewInit === "function") $$props.onViewInit(view);
    	}

    	onMount(() => {
    		if (!init) return;

    		f7.ready(() => {
    			f7.instance.on("tabShow", onTabShow);
    			f7.instance.on("tabHide", onTabHide);

    			routerData = {
    				el,
    				instance: null,
    				pages,
    				setPages(p) {
    					tick().then(() => {
    						$$invalidate(3, pages = p);
    					});
    				}
    			};

    			f7.routers.views.push(routerData);

    			routerData.instance = f7.instance.views.create(el, {
    				...Utils.noUndefinedProps($$props),
    				on: { init: onViewInit }
    			});

    			if (!f7View) f7View = routerData.instance;
    			f7View.on("resize", onResize);
    			f7View.on("swipebackMove", onSwipeBackMove);
    			f7View.on("swipebackBeforeChange", onSwipeBackBeforeChange);
    			f7View.on("swipebackAfterChange", onSwipeBackAfterChange);
    			f7View.on("swipebackBeforeReset", onSwipeBackBeforeReset);
    			f7View.on("swipebackAfterReset", onSwipeBackAfterReset);
    		});
    	});

    	afterUpdate(() => {
    		if (!routerData) return;
    		f7.events.emit("viewRouterDidUpdate", routerData);
    	});

    	onDestroy(() => {
    		if (!init) return;

    		if (f7.instance) {
    			f7.instance.off("tabShow", onTabShow);
    			f7.instance.off("tabHide", onTabHide);
    		}

    		if (f7View) {
    			f7View.off("resize", onResize);
    			f7View.off("swipebackMove", onSwipeBackMove);
    			f7View.off("swipebackBeforeChange", onSwipeBackBeforeChange);
    			f7View.off("swipebackAfterChange", onSwipeBackAfterChange);
    			f7View.off("swipebackBeforeReset", onSwipeBackBeforeReset);
    			f7View.off("swipebackAfterReset", onSwipeBackAfterReset);

    			if (f7View.destroy) {
    				f7View.destroy();
    			}
    		}

    		f7.routers.views.splice(f7.routers.views.indexOf(routerData), 1);
    		f7View = null;
    		routerData = null;
    	});

    	let { $$slots = {}, $$scope } = $$props;

    	function div_binding($$value) {
    		binding_callbacks[$$value ? "unshift" : "push"](() => {
    			$$invalidate(2, el = $$value);
    		});
    	}

    	$$self.$set = $$new_props => {
    		$$invalidate(23, $$props = assign(assign({}, $$props), exclude_internal_props($$new_props)));
    		if ("id" in $$new_props) $$invalidate(0, id = $$new_props.id);
    		if ("style" in $$new_props) $$invalidate(1, style = $$new_props.style);
    		if ("init" in $$new_props) $$invalidate(5, init = $$new_props.init);
    		if ("class" in $$new_props) $$invalidate(6, className = $$new_props.class);
    		if ("$$scope" in $$new_props) $$invalidate(24, $$scope = $$new_props.$$scope);
    	};

    	let classes;

    	$$self.$$.update = () => {
    		 $$invalidate(4, classes = Utils.classNames(
    			className,
    			"view",
    			{
    				"view-main": main,
    				"tab-active": tabActive,
    				tab
    			},
    			Mixins.colorClasses($$props)
    		));
    	};

    	$$props = exclude_internal_props($$props);

    	return [
    		id,
    		style,
    		el,
    		pages,
    		classes,
    		init,
    		className,
    		instance,
    		routerData,
    		f7View,
    		dispatch,
    		main,
    		tab,
    		tabActive,
    		onResize,
    		onSwipeBackMove,
    		onSwipeBackBeforeChange,
    		onSwipeBackAfterChange,
    		onSwipeBackBeforeReset,
    		onSwipeBackAfterReset,
    		onTabShow,
    		onTabHide,
    		onViewInit,
    		$$props,
    		$$scope,
    		$$slots,
    		div_binding
    	];
    }

    class View extends SvelteComponent {
    	constructor(options) {
    		super();

    		init(this, options, instance_1$5, create_fragment$o, safe_not_equal, {
    			id: 0,
    			style: 1,
    			init: 5,
    			class: 6,
    			instance: 7
    		});
    	}

    	get instance() {
    		return this.$$.ctx[7];
    	}
    }

    /**
     * Framework7 Svelte 5.7.14
     * Build full featured iOS & Android apps using Framework7 & Svelte
     * https://framework7.io/svelte/
     *
     * Copyright 2014-2020 Vladimir Kharlampidi
     *
     * Released under the MIT License
     *
     * Released on: November 9, 2020
     */

    /* src/pug/docs-demos/svelte/messages.svelte generated by Svelte v3.22.3 */

    function get_each_context$2(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[23] = list[i];
    	child_ctx[25] = i;
    	return child_ctx;
    }

    function get_each_context_1(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[26] = list[i];
    	child_ctx[25] = i;
    	return child_ctx;
    }

    function get_each_context_2(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[26] = list[i];
    	child_ctx[25] = i;
    	return child_ctx;
    }

    // (14:8) <a class="link icon-only" slot="inner-start" on:click={() => sheetVisible = !sheetVisible}>
    function create_inner_start_slot(ctx) {
    	let a;
    	let current;
    	let dispose;

    	const icon = new Icon({
    			props: {
    				ios: "f7:camera_fill",
    				aurora: "f7:camera_fill",
    				md: "material:camera_alt"
    			}
    		});

    	return {
    		c() {
    			a = element("a");
    			create_component(icon.$$.fragment);
    			attr(a, "class", "link icon-only");
    			attr(a, "slot", "inner-start");
    		},
    		m(target, anchor, remount) {
    			insert(target, a, anchor);
    			mount_component(icon, a, null);
    			current = true;
    			if (remount) dispose();
    			dispose = listen(a, "click", /*click_handler*/ ctx[19]);
    		},
    		p: noop,
    		i(local) {
    			if (current) return;
    			transition_in(icon.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(icon.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(a);
    			destroy_component(icon);
    			dispose();
    		}
    	};
    }

    // (21:8) <a class="link icon-only" slot="inner-end" on:click={sendMessage}>
    function create_inner_end_slot(ctx) {
    	let a;
    	let current;
    	let dispose;

    	const icon = new Icon({
    			props: {
    				ios: "f7:arrow_up_circle_fill",
    				aurora: "f7:arrow_up_circle_fill",
    				md: "material:send"
    			}
    		});

    	return {
    		c() {
    			a = element("a");
    			create_component(icon.$$.fragment);
    			attr(a, "class", "link icon-only");
    			attr(a, "slot", "inner-end");
    		},
    		m(target, anchor, remount) {
    			insert(target, a, anchor);
    			mount_component(icon, a, null);
    			current = true;
    			if (remount) dispose();
    			dispose = listen(a, "click", /*sendMessage*/ ctx[14]);
    		},
    		p: noop,
    		i(local) {
    			if (current) return;
    			transition_in(icon.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(icon.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(a);
    			destroy_component(icon);
    			dispose();
    		}
    	};
    }

    // (29:10) {#each attachments as image, index (index)}
    function create_each_block_2(key_1, ctx) {
    	let first;
    	let current;

    	function func(...args) {
    		return /*func*/ ctx[20](/*image*/ ctx[26], ...args);
    	}

    	const messagebarattachment = new Messagebar_attachment({
    			props: {
    				key: /*index*/ ctx[25],
    				image: /*image*/ ctx[26],
    				onAttachmentDelete: func
    			}
    		});

    	return {
    		key: key_1,
    		first: null,
    		c() {
    			first = empty();
    			create_component(messagebarattachment.$$.fragment);
    			this.first = first;
    		},
    		m(target, anchor) {
    			insert(target, first, anchor);
    			mount_component(messagebarattachment, target, anchor);
    			current = true;
    		},
    		p(new_ctx, dirty) {
    			ctx = new_ctx;
    			const messagebarattachment_changes = {};
    			if (dirty & /*attachments*/ 2) messagebarattachment_changes.key = /*index*/ ctx[25];
    			if (dirty & /*attachments*/ 2) messagebarattachment_changes.image = /*image*/ ctx[26];
    			if (dirty & /*attachments*/ 2) messagebarattachment_changes.onAttachmentDelete = func;
    			messagebarattachment.$set(messagebarattachment_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(messagebarattachment.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(messagebarattachment.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(first);
    			destroy_component(messagebarattachment, detaching);
    		}
    	};
    }

    // (28:8) <MessagebarAttachments>
    function create_default_slot_7(ctx) {
    	let each_blocks = [];
    	let each_1_lookup = new Map();
    	let each_1_anchor;
    	let current;
    	let each_value_2 = /*attachments*/ ctx[1];
    	const get_key = ctx => /*index*/ ctx[25];

    	for (let i = 0; i < each_value_2.length; i += 1) {
    		let child_ctx = get_each_context_2(ctx, each_value_2, i);
    		let key = get_key(child_ctx);
    		each_1_lookup.set(key, each_blocks[i] = create_each_block_2(key, child_ctx));
    	}

    	return {
    		c() {
    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			each_1_anchor = empty();
    		},
    		m(target, anchor) {
    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].m(target, anchor);
    			}

    			insert(target, each_1_anchor, anchor);
    			current = true;
    		},
    		p(ctx, dirty) {
    			if (dirty & /*attachments, deleteAttachment*/ 4098) {
    				const each_value_2 = /*attachments*/ ctx[1];
    				group_outros();
    				each_blocks = update_keyed_each(each_blocks, dirty, get_key, 1, ctx, each_value_2, each_1_lookup, each_1_anchor.parentNode, outro_and_destroy_block, create_each_block_2, each_1_anchor, get_each_context_2);
    				check_outros();
    			}
    		},
    		i(local) {
    			if (current) return;

    			for (let i = 0; i < each_value_2.length; i += 1) {
    				transition_in(each_blocks[i]);
    			}

    			current = true;
    		},
    		o(local) {
    			for (let i = 0; i < each_blocks.length; i += 1) {
    				transition_out(each_blocks[i]);
    			}

    			current = false;
    		},
    		d(detaching) {
    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].d(detaching);
    			}

    			if (detaching) detach(each_1_anchor);
    		}
    	};
    }

    // (38:10) {#each images as image, index (index)}
    function create_each_block_1(key_1, ctx) {
    	let first;
    	let current;

    	const messagebarsheetimage = new Messagebar_sheet_image({
    			props: {
    				key: /*index*/ ctx[25],
    				image: /*image*/ ctx[26],
    				checked: /*attachments*/ ctx[1].indexOf(/*image*/ ctx[26]) >= 0,
    				onChange: /*handleAttachment*/ ctx[13]
    			}
    		});

    	return {
    		key: key_1,
    		first: null,
    		c() {
    			first = empty();
    			create_component(messagebarsheetimage.$$.fragment);
    			this.first = first;
    		},
    		m(target, anchor) {
    			insert(target, first, anchor);
    			mount_component(messagebarsheetimage, target, anchor);
    			current = true;
    		},
    		p(ctx, dirty) {
    			const messagebarsheetimage_changes = {};
    			if (dirty & /*attachments*/ 2) messagebarsheetimage_changes.checked = /*attachments*/ ctx[1].indexOf(/*image*/ ctx[26]) >= 0;
    			messagebarsheetimage.$set(messagebarsheetimage_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(messagebarsheetimage.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(messagebarsheetimage.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(first);
    			destroy_component(messagebarsheetimage, detaching);
    		}
    	};
    }

    // (37:8) <MessagebarSheet>
    function create_default_slot_6(ctx) {
    	let each_blocks = [];
    	let each_1_lookup = new Map();
    	let each_1_anchor;
    	let current;
    	let each_value_1 = /*images*/ ctx[8];
    	const get_key = ctx => /*index*/ ctx[25];

    	for (let i = 0; i < each_value_1.length; i += 1) {
    		let child_ctx = get_each_context_1(ctx, each_value_1, i);
    		let key = get_key(child_ctx);
    		each_1_lookup.set(key, each_blocks[i] = create_each_block_1(key, child_ctx));
    	}

    	return {
    		c() {
    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			each_1_anchor = empty();
    		},
    		m(target, anchor) {
    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].m(target, anchor);
    			}

    			insert(target, each_1_anchor, anchor);
    			current = true;
    		},
    		p(ctx, dirty) {
    			if (dirty & /*images, attachments, handleAttachment*/ 8450) {
    				const each_value_1 = /*images*/ ctx[8];
    				group_outros();
    				each_blocks = update_keyed_each(each_blocks, dirty, get_key, 1, ctx, each_value_1, each_1_lookup, each_1_anchor.parentNode, outro_and_destroy_block, create_each_block_1, each_1_anchor, get_each_context_1);
    				check_outros();
    			}
    		},
    		i(local) {
    			if (current) return;

    			for (let i = 0; i < each_value_1.length; i += 1) {
    				transition_in(each_blocks[i]);
    			}

    			current = true;
    		},
    		o(local) {
    			for (let i = 0; i < each_blocks.length; i += 1) {
    				transition_out(each_blocks[i]);
    			}

    			current = false;
    		},
    		d(detaching) {
    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].d(detaching);
    			}

    			if (detaching) detach(each_1_anchor);
    		}
    	};
    }

    // (6:6) <Messagebar         placeholder={placeholder}         bind:this={messagebarComponent}         attachmentsVisible={attachmentsVisible}         sheetVisible={sheetVisible}         value={messageText}         onInput={(e) => messageText = e.target.value}       >
    function create_default_slot_5(ctx) {
    	let t0;
    	let t1;
    	let t2;
    	let current;

    	const messagebarattachments = new Messagebar_attachments({
    			props: {
    				$$slots: { default: [create_default_slot_7] },
    				$$scope: { ctx }
    			}
    		});

    	const messagebarsheet = new Messagebar_sheet({
    			props: {
    				$$slots: { default: [create_default_slot_6] },
    				$$scope: { ctx }
    			}
    		});

    	return {
    		c() {
    			t0 = space();
    			t1 = space();
    			create_component(messagebarattachments.$$.fragment);
    			t2 = space();
    			create_component(messagebarsheet.$$.fragment);
    		},
    		m(target, anchor) {
    			insert(target, t0, anchor);
    			insert(target, t1, anchor);
    			mount_component(messagebarattachments, target, anchor);
    			insert(target, t2, anchor);
    			mount_component(messagebarsheet, target, anchor);
    			current = true;
    		},
    		p(ctx, dirty) {
    			const messagebarattachments_changes = {};

    			if (dirty & /*$$scope, attachments*/ 536870914) {
    				messagebarattachments_changes.$$scope = { dirty, ctx };
    			}

    			messagebarattachments.$set(messagebarattachments_changes);
    			const messagebarsheet_changes = {};

    			if (dirty & /*$$scope, attachments*/ 536870914) {
    				messagebarsheet_changes.$$scope = { dirty, ctx };
    			}

    			messagebarsheet.$set(messagebarsheet_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(messagebarattachments.$$.fragment, local);
    			transition_in(messagebarsheet.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(messagebarattachments.$$.fragment, local);
    			transition_out(messagebarsheet.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(t0);
    			if (detaching) detach(t1);
    			destroy_component(messagebarattachments, detaching);
    			if (detaching) detach(t2);
    			destroy_component(messagebarsheet, detaching);
    		}
    	};
    }

    // (50:8) <MessagesTitle>
    function create_default_slot_4(ctx) {
    	let b;
    	let t1;

    	return {
    		c() {
    			b = element("b");
    			b.textContent = "Sunday, Feb 9,";
    			t1 = text(" 12:58");
    		},
    		m(target, anchor) {
    			insert(target, b, anchor);
    			insert(target, t1, anchor);
    		},
    		d(detaching) {
    			if (detaching) detach(b);
    			if (detaching) detach(t1);
    		}
    	};
    }

    // (51:8) {#each messagesData as message, index (index)}
    function create_each_block$2(key_1, ctx) {
    	let first;
    	let current;

    	const message = new Message({
    			props: {
    				type: /*message*/ ctx[23].type,
    				image: /*message*/ ctx[23].image,
    				name: /*message*/ ctx[23].name,
    				avatar: /*message*/ ctx[23].avatar,
    				first: /*isFirstMessage*/ ctx[9](/*message*/ ctx[23], /*index*/ ctx[25]),
    				last: /*isLastMessage*/ ctx[10](/*message*/ ctx[23], /*index*/ ctx[25]),
    				tail: /*isTailMessage*/ ctx[11](/*message*/ ctx[23], /*index*/ ctx[25]),
    				htmlText: /*message*/ ctx[23].text
    			}
    		});

    	return {
    		key: key_1,
    		first: null,
    		c() {
    			first = empty();
    			create_component(message.$$.fragment);
    			this.first = first;
    		},
    		m(target, anchor) {
    			insert(target, first, anchor);
    			mount_component(message, target, anchor);
    			current = true;
    		},
    		p(ctx, dirty) {
    			const message_changes = {};
    			if (dirty & /*messagesData*/ 32) message_changes.type = /*message*/ ctx[23].type;
    			if (dirty & /*messagesData*/ 32) message_changes.image = /*message*/ ctx[23].image;
    			if (dirty & /*messagesData*/ 32) message_changes.name = /*message*/ ctx[23].name;
    			if (dirty & /*messagesData*/ 32) message_changes.avatar = /*message*/ ctx[23].avatar;
    			if (dirty & /*messagesData*/ 32) message_changes.first = /*isFirstMessage*/ ctx[9](/*message*/ ctx[23], /*index*/ ctx[25]);
    			if (dirty & /*messagesData*/ 32) message_changes.last = /*isLastMessage*/ ctx[10](/*message*/ ctx[23], /*index*/ ctx[25]);
    			if (dirty & /*messagesData*/ 32) message_changes.tail = /*isTailMessage*/ ctx[11](/*message*/ ctx[23], /*index*/ ctx[25]);
    			if (dirty & /*messagesData*/ 32) message_changes.htmlText = /*message*/ ctx[23].text;
    			message.$set(message_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(message.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(message.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(first);
    			destroy_component(message, detaching);
    		}
    	};
    }

    // (63:8) {#if typingMessage}
    function create_if_block$c(ctx) {
    	let current;

    	const message = new Message({
    			props: {
    				type: "received",
    				typing: true,
    				first: true,
    				last: true,
    				tail: true,
    				header: `${/*typingMessage*/ ctx[3].name} is typing`,
    				avatar: /*typingMessage*/ ctx[3].avatar
    			}
    		});

    	return {
    		c() {
    			create_component(message.$$.fragment);
    		},
    		m(target, anchor) {
    			mount_component(message, target, anchor);
    			current = true;
    		},
    		p(ctx, dirty) {
    			const message_changes = {};
    			if (dirty & /*typingMessage*/ 8) message_changes.header = `${/*typingMessage*/ ctx[3].name} is typing`;
    			if (dirty & /*typingMessage*/ 8) message_changes.avatar = /*typingMessage*/ ctx[3].avatar;
    			message.$set(message_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(message.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(message.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			destroy_component(message, detaching);
    		}
    	};
    }

    // (49:6) <Messages>
    function create_default_slot_3(ctx) {
    	let t0;
    	let each_blocks = [];
    	let each_1_lookup = new Map();
    	let t1;
    	let if_block_anchor;
    	let current;

    	const messagestitle = new Messages_title({
    			props: {
    				$$slots: { default: [create_default_slot_4] },
    				$$scope: { ctx }
    			}
    		});

    	let each_value = /*messagesData*/ ctx[5];
    	const get_key = ctx => /*index*/ ctx[25];

    	for (let i = 0; i < each_value.length; i += 1) {
    		let child_ctx = get_each_context$2(ctx, each_value, i);
    		let key = get_key(child_ctx);
    		each_1_lookup.set(key, each_blocks[i] = create_each_block$2(key, child_ctx));
    	}

    	let if_block = /*typingMessage*/ ctx[3] && create_if_block$c(ctx);

    	return {
    		c() {
    			create_component(messagestitle.$$.fragment);
    			t0 = space();

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			t1 = space();
    			if (if_block) if_block.c();
    			if_block_anchor = empty();
    		},
    		m(target, anchor) {
    			mount_component(messagestitle, target, anchor);
    			insert(target, t0, anchor);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].m(target, anchor);
    			}

    			insert(target, t1, anchor);
    			if (if_block) if_block.m(target, anchor);
    			insert(target, if_block_anchor, anchor);
    			current = true;
    		},
    		p(ctx, dirty) {
    			const messagestitle_changes = {};

    			if (dirty & /*$$scope*/ 536870912) {
    				messagestitle_changes.$$scope = { dirty, ctx };
    			}

    			messagestitle.$set(messagestitle_changes);

    			if (dirty & /*messagesData, isFirstMessage, isLastMessage, isTailMessage*/ 3616) {
    				const each_value = /*messagesData*/ ctx[5];
    				group_outros();
    				each_blocks = update_keyed_each(each_blocks, dirty, get_key, 1, ctx, each_value, each_1_lookup, t1.parentNode, outro_and_destroy_block, create_each_block$2, t1, get_each_context$2);
    				check_outros();
    			}

    			if (/*typingMessage*/ ctx[3]) {
    				if (if_block) {
    					if_block.p(ctx, dirty);

    					if (dirty & /*typingMessage*/ 8) {
    						transition_in(if_block, 1);
    					}
    				} else {
    					if_block = create_if_block$c(ctx);
    					if_block.c();
    					transition_in(if_block, 1);
    					if_block.m(if_block_anchor.parentNode, if_block_anchor);
    				}
    			} else if (if_block) {
    				group_outros();

    				transition_out(if_block, 1, 1, () => {
    					if_block = null;
    				});

    				check_outros();
    			}
    		},
    		i(local) {
    			if (current) return;
    			transition_in(messagestitle.$$.fragment, local);

    			for (let i = 0; i < each_value.length; i += 1) {
    				transition_in(each_blocks[i]);
    			}

    			transition_in(if_block);
    			current = true;
    		},
    		o(local) {
    			transition_out(messagestitle.$$.fragment, local);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				transition_out(each_blocks[i]);
    			}

    			transition_out(if_block);
    			current = false;
    		},
    		d(detaching) {
    			destroy_component(messagestitle, detaching);
    			if (detaching) detach(t0);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].d(detaching);
    			}

    			if (detaching) detach(t1);
    			if (if_block) if_block.d(detaching);
    			if (detaching) detach(if_block_anchor);
    		}
    	};
    }

    // (3:4) <Page>
    function create_default_slot_2$2(ctx) {
    	let t0;
    	let t1;
    	let current;
    	const navbar = new Navbar({ props: { title: "Messages" } });

    	let messagebar_props = {
    		placeholder: /*placeholder*/ ctx[7],
    		attachmentsVisible: /*attachmentsVisible*/ ctx[6],
    		sheetVisible: /*sheetVisible*/ ctx[2],
    		value: /*messageText*/ ctx[4],
    		onInput: /*func_1*/ ctx[21],
    		$$slots: {
    			default: [create_default_slot_5],
    			"inner-end": [create_inner_end_slot],
    			"inner-start": [create_inner_start_slot]
    		},
    		$$scope: { ctx }
    	};

    	const messagebar = new Messagebar({ props: messagebar_props });
    	/*messagebar_binding*/ ctx[22](messagebar);

    	const messages = new Messages({
    			props: {
    				$$slots: { default: [create_default_slot_3] },
    				$$scope: { ctx }
    			}
    		});

    	return {
    		c() {
    			create_component(navbar.$$.fragment);
    			t0 = space();
    			create_component(messagebar.$$.fragment);
    			t1 = space();
    			create_component(messages.$$.fragment);
    		},
    		m(target, anchor) {
    			mount_component(navbar, target, anchor);
    			insert(target, t0, anchor);
    			mount_component(messagebar, target, anchor);
    			insert(target, t1, anchor);
    			mount_component(messages, target, anchor);
    			current = true;
    		},
    		p(ctx, dirty) {
    			const messagebar_changes = {};
    			if (dirty & /*placeholder*/ 128) messagebar_changes.placeholder = /*placeholder*/ ctx[7];
    			if (dirty & /*attachmentsVisible*/ 64) messagebar_changes.attachmentsVisible = /*attachmentsVisible*/ ctx[6];
    			if (dirty & /*sheetVisible*/ 4) messagebar_changes.sheetVisible = /*sheetVisible*/ ctx[2];
    			if (dirty & /*messageText*/ 16) messagebar_changes.value = /*messageText*/ ctx[4];
    			if (dirty & /*messageText*/ 16) messagebar_changes.onInput = /*func_1*/ ctx[21];

    			if (dirty & /*$$scope, attachments, sheetVisible*/ 536870918) {
    				messagebar_changes.$$scope = { dirty, ctx };
    			}

    			messagebar.$set(messagebar_changes);
    			const messages_changes = {};

    			if (dirty & /*$$scope, typingMessage, messagesData*/ 536870952) {
    				messages_changes.$$scope = { dirty, ctx };
    			}

    			messages.$set(messages_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(navbar.$$.fragment, local);
    			transition_in(messagebar.$$.fragment, local);
    			transition_in(messages.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(navbar.$$.fragment, local);
    			transition_out(messagebar.$$.fragment, local);
    			transition_out(messages.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			destroy_component(navbar, detaching);
    			if (detaching) detach(t0);
    			/*messagebar_binding*/ ctx[22](null);
    			destroy_component(messagebar, detaching);
    			if (detaching) detach(t1);
    			destroy_component(messages, detaching);
    		}
    	};
    }

    // (2:2) <View main>
    function create_default_slot_1$2(ctx) {
    	let current;

    	const page = new Page({
    			props: {
    				$$slots: { default: [create_default_slot_2$2] },
    				$$scope: { ctx }
    			}
    		});

    	return {
    		c() {
    			create_component(page.$$.fragment);
    		},
    		m(target, anchor) {
    			mount_component(page, target, anchor);
    			current = true;
    		},
    		p(ctx, dirty) {
    			const page_changes = {};

    			if (dirty & /*$$scope, typingMessage, messagesData, placeholder, attachmentsVisible, sheetVisible, messageText, messagebarComponent, attachments*/ 536871167) {
    				page_changes.$$scope = { dirty, ctx };
    			}

    			page.$set(page_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(page.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(page.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			destroy_component(page, detaching);
    		}
    	};
    }

    // (1:0) <App>
    function create_default_slot$4(ctx) {
    	let current;

    	const view = new View({
    			props: {
    				main: true,
    				$$slots: { default: [create_default_slot_1$2] },
    				$$scope: { ctx }
    			}
    		});

    	return {
    		c() {
    			create_component(view.$$.fragment);
    		},
    		m(target, anchor) {
    			mount_component(view, target, anchor);
    			current = true;
    		},
    		p(ctx, dirty) {
    			const view_changes = {};

    			if (dirty & /*$$scope, typingMessage, messagesData, placeholder, attachmentsVisible, sheetVisible, messageText, messagebarComponent, attachments*/ 536871167) {
    				view_changes.$$scope = { dirty, ctx };
    			}

    			view.$set(view_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(view.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(view.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			destroy_component(view, detaching);
    		}
    	};
    }

    function create_fragment$p(ctx) {
    	let current;

    	const app = new App({
    			props: {
    				$$slots: { default: [create_default_slot$4] },
    				$$scope: { ctx }
    			}
    		});

    	return {
    		c() {
    			create_component(app.$$.fragment);
    		},
    		m(target, anchor) {
    			mount_component(app, target, anchor);
    			current = true;
    		},
    		p(ctx, [dirty]) {
    			const app_changes = {};

    			if (dirty & /*$$scope, typingMessage, messagesData, placeholder, attachmentsVisible, sheetVisible, messageText, messagebarComponent, attachments*/ 536871167) {
    				app_changes.$$scope = { dirty, ctx };
    			}

    			app.$set(app_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(app.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(app.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			destroy_component(app, detaching);
    		}
    	};
    }

    function instance$j($$self, $$props, $$invalidate) {
    	let messagebarComponent;
    	let messagebarInstance;
    	let attachments = [];
    	let sheetVisible = false;
    	let typingMessage = null;
    	let messageText = "";

    	let messagesData = [
    		{ type: "sent", text: "Hi, Kate" },
    		{ type: "sent", text: "How are you?" },
    		{
    			name: "Kate",
    			type: "received",
    			text: "Hi, I am good!",
    			avatar: "https://cdn.framework7.io/placeholder/people-100x100-9.jpg"
    		},
    		{
    			name: "Blue Ninja",
    			type: "received",
    			text: "Hi there, I am also fine, thanks! And how are you?",
    			avatar: "https://cdn.framework7.io/placeholder/people-100x100-7.jpg"
    		},
    		{
    			type: "sent",
    			text: "Hey, Blue Ninja! Glad to see you ;)"
    		},
    		{
    			type: "sent",
    			text: "Hey, look, cutest kitten ever!"
    		},
    		{
    			type: "sent",
    			image: "https://cdn.framework7.io/placeholder/cats-200x260-4.jpg"
    		},
    		{
    			name: "Kate",
    			type: "received",
    			text: "Nice!",
    			avatar: "https://cdn.framework7.io/placeholder/people-100x100-9.jpg"
    		},
    		{
    			name: "Kate",
    			type: "received",
    			text: "Like it very much!",
    			avatar: "https://cdn.framework7.io/placeholder/people-100x100-9.jpg"
    		},
    		{
    			name: "Blue Ninja",
    			type: "received",
    			text: "Awesome!",
    			avatar: "https://cdn.framework7.io/placeholder/people-100x100-7.jpg"
    		}
    	];

    	let images = [
    		"https://cdn.framework7.io/placeholder/cats-300x300-1.jpg",
    		"https://cdn.framework7.io/placeholder/cats-200x300-2.jpg",
    		"https://cdn.framework7.io/placeholder/cats-400x300-3.jpg",
    		"https://cdn.framework7.io/placeholder/cats-300x150-4.jpg",
    		"https://cdn.framework7.io/placeholder/cats-150x300-5.jpg",
    		"https://cdn.framework7.io/placeholder/cats-300x300-6.jpg",
    		"https://cdn.framework7.io/placeholder/cats-300x300-7.jpg",
    		"https://cdn.framework7.io/placeholder/cats-200x300-8.jpg",
    		"https://cdn.framework7.io/placeholder/cats-400x300-9.jpg",
    		"https://cdn.framework7.io/placeholder/cats-300x150-10.jpg"
    	];

    	let people = [
    		{
    			name: "Kate Johnson",
    			avatar: "https://cdn.framework7.io/placeholder/people-100x100-9.jpg"
    		},
    		{
    			name: "Blue Ninja",
    			avatar: "https://cdn.framework7.io/placeholder/people-100x100-7.jpg"
    		}
    	];

    	let answers = [
    		"Yes!",
    		"No",
    		"Hm...",
    		"I am not sure",
    		"And what about you?",
    		"May be ;)",
    		"Lorem ipsum dolor sit amet, consectetur",
    		"What?",
    		"Are you sure?",
    		"Of course",
    		"Need to think about it",
    		"Amazing!!!"
    	];

    	let responseInProgress = false;

    	onMount(() => {
    		f7ready(() => {
    			messagebarInstance = messagebarComponent.instance();
    		});
    	});

    	function isFirstMessage(message, index) {
    		const previousMessage = messagesData[index - 1];
    		if (message.isTitle) return false;
    		if (!previousMessage || previousMessage.type !== message.type || previousMessage.name !== message.name) return true;
    		return false;
    	}

    	function isLastMessage(message, index) {
    		const nextMessage = messagesData[index + 1];
    		if (message.isTitle) return false;
    		if (!nextMessage || nextMessage.type !== message.type || nextMessage.name !== message.name) return true;
    		return false;
    	}

    	function isTailMessage(message, index) {
    		const nextMessage = messagesData[index + 1];
    		if (message.isTitle) return false;
    		if (!nextMessage || nextMessage.type !== message.type || nextMessage.name !== message.name) return true;
    		return false;
    	}

    	function deleteAttachment(image) {
    		const index = attachments.indexOf(image);
    		attachments.splice(index, 1);
    		$$invalidate(1, attachments);
    	}

    	function handleAttachment(e) {
    		const index = f7Instance.$(e.target).parents("label.checkbox").index();
    		const image = images[index];

    		if (e.target.checked) {
    			// Add to attachments
    			attachments.unshift(image);
    		} else {
    			// Remove from attachments
    			attachments.splice(attachments.indexOf(image), 1);
    		}

    		$$invalidate(1, attachments);
    	}

    	function sendMessage() {
    		const text = messageText.replace(/\n/g, "<br>").trim();
    		const messagesToSend = [];

    		attachments.forEach(attachment => {
    			messagesToSend.push({ type: "sent", image: attachment });
    		});

    		if (text.length) {
    			messagesToSend.push({ text, type: "sent" });
    		}

    		if (messagesToSend.length === 0) {
    			return;
    		}

    		// Reset attachments
    		$$invalidate(1, attachments = []);

    		// Hide sheet
    		$$invalidate(2, sheetVisible = false);

    		// Send message
    		$$invalidate(5, messagesData = [...messagesData, ...messagesToSend]);

    		// Clear
    		$$invalidate(4, messageText = "");

    		messagebarInstance.clear();

    		// Focus area
    		if (text.length) messagebarInstance.focus();

    		// Mock response
    		if (responseInProgress) return;

    		responseInProgress = true;

    		setTimeout(
    			() => {
    				const answer = answers[Math.floor(Math.random() * answers.length)];
    				const person = people[Math.floor(Math.random() * people.length)];
    				$$invalidate(3, typingMessage = { name: person.name, avatar: person.avatar });

    				setTimeout(
    					() => {
    						$$invalidate(5, messagesData = [
    							...messagesData,
    							{
    								text: answer,
    								type: "received",
    								name: person.name,
    								avatar: person.avatar
    							}
    						]);

    						$$invalidate(3, typingMessage = null);
    						responseInProgress = false;
    					},
    					4000
    				);
    			},
    			1000
    		);
    	}

    	const click_handler = () => $$invalidate(2, sheetVisible = !sheetVisible);
    	const func = image => deleteAttachment(image);
    	const func_1 = e => $$invalidate(4, messageText = e.target.value);

    	function messagebar_binding($$value) {
    		binding_callbacks[$$value ? "unshift" : "push"](() => {
    			$$invalidate(0, messagebarComponent = $$value);
    		});
    	}

    	let attachmentsVisible;
    	let placeholder;

    	$$self.$$.update = () => {
    		if ($$self.$$.dirty & /*attachments*/ 2) {
    			 $$invalidate(6, attachmentsVisible = attachments.length > 0);
    		}

    		if ($$self.$$.dirty & /*attachments*/ 2) {
    			 $$invalidate(7, placeholder = attachments.length > 0
    			? "Add comment or Send"
    			: "Message");
    		}
    	};

    	return [
    		messagebarComponent,
    		attachments,
    		sheetVisible,
    		typingMessage,
    		messageText,
    		messagesData,
    		attachmentsVisible,
    		placeholder,
    		images,
    		isFirstMessage,
    		isLastMessage,
    		isTailMessage,
    		deleteAttachment,
    		handleAttachment,
    		sendMessage,
    		messagebarInstance,
    		responseInProgress,
    		people,
    		answers,
    		click_handler,
    		func,
    		func_1,
    		messagebar_binding
    	];
    }

    class Messages_1 extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance$j, create_fragment$p, safe_not_equal, {});
    	}
    }

    let theme = 'ios';
    if (window.location.href.indexOf('theme=md') >= 0) theme = 'md';
    if (window.location.href.indexOf('theme=aurora') >= 0) theme = 'aurora';

    const themePlugin = {
      params: {
        theme,
      },
    };

    Framework7.use(themePlugin);
    Framework7.use(Plugin, { theme });

    // Init Svelte App
    const app = new Messages_1({
      target: document.getElementById('app'),
    });

    return app;

})));
