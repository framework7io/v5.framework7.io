(function (global, factory) {
    typeof exports === 'object' && typeof module !== 'undefined' ? module.exports = factory(require('framework7')) :
    typeof define === 'function' && define.amd ? define(['framework7'], factory) :
    (global = global || self, global.cards = factory(global.Framework7));
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
    function set_style(node, key, value, important) {
        node.style.setProperty(key, value, important ? 'important' : '');
    }
    function toggle_class(element, name, toggle) {
        element.classList[toggle ? 'add' : 'remove'](name);
    }
    function custom_event(type, detail) {
        const e = document.createEvent('CustomEvent');
        e.initCustomEvent(type, false, false, detail);
        return e;
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
    function setContext(key, context) {
        get_current_component().$$.context.set(key, context);
    }
    function getContext(key) {
        return get_current_component().$$.context.get(key);
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
        if (instance.initialized) {
          f7.instance = instance;
          events.emit('ready', f7.instance);
        } else {
          instance.on('init', () => {
            f7.instance = instance;
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

    /* public/packages/svelte/components/block-title.svelte generated by Svelte v3.22.3 */

    function create_fragment$3(ctx) {
    	let div;
    	let current;
    	const default_slot_template = /*$$slots*/ ctx[7].default;
    	const default_slot = create_slot(default_slot_template, ctx, /*$$scope*/ ctx[6], null);
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
    				if (default_slot.p && dirty & /*$$scope*/ 64) {
    					default_slot.p(get_slot_context(default_slot_template, ctx, /*$$scope*/ ctx[6], null), get_slot_changes(default_slot_template, /*$$scope*/ ctx[6], dirty, null));
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

    function instance$3($$self, $$props, $$invalidate) {
    	const omit_props_names = ["large","medium","class"];
    	let $$restProps = compute_rest_props($$props, omit_props_names);
    	let { large = false } = $$props;
    	let { medium = false } = $$props;
    	let { class: className = undefined } = $$props;
    	let { $$slots = {}, $$scope } = $$props;

    	$$self.$set = $$new_props => {
    		$$invalidate(5, $$props = assign(assign({}, $$props), exclude_internal_props($$new_props)));
    		$$invalidate(1, $$restProps = compute_rest_props($$props, omit_props_names));
    		if ("large" in $$new_props) $$invalidate(2, large = $$new_props.large);
    		if ("medium" in $$new_props) $$invalidate(3, medium = $$new_props.medium);
    		if ("class" in $$new_props) $$invalidate(4, className = $$new_props.class);
    		if ("$$scope" in $$new_props) $$invalidate(6, $$scope = $$new_props.$$scope);
    	};

    	let classes;

    	$$self.$$.update = () => {
    		 $$invalidate(0, classes = Utils.classNames(
    			className,
    			"block-title",
    			{
    				"block-title-large": large,
    				"block-title-medium": medium
    			},
    			Mixins.colorClasses($$props)
    		));
    	};

    	$$props = exclude_internal_props($$props);
    	return [classes, $$restProps, large, medium, className, $$props, $$scope, $$slots];
    }

    class Block_title extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance$3, create_fragment$3, safe_not_equal, { large: 2, medium: 3, class: 4 });
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

    function create_fragment$4(ctx) {
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

    function instance$4($$self, $$props, $$invalidate) {
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

    		init(this, options, instance$4, create_fragment$4, safe_not_equal, {
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

    /* public/packages/svelte/components/card-content.svelte generated by Svelte v3.22.3 */

    function create_fragment$5(ctx) {
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

    function instance$5($$self, $$props, $$invalidate) {
    	const omit_props_names = ["class","padding"];
    	let $$restProps = compute_rest_props($$props, omit_props_names);
    	let { class: className = undefined } = $$props;
    	let { padding = true } = $$props;
    	let { $$slots = {}, $$scope } = $$props;

    	$$self.$set = $$new_props => {
    		$$invalidate(4, $$props = assign(assign({}, $$props), exclude_internal_props($$new_props)));
    		$$invalidate(1, $$restProps = compute_rest_props($$props, omit_props_names));
    		if ("class" in $$new_props) $$invalidate(2, className = $$new_props.class);
    		if ("padding" in $$new_props) $$invalidate(3, padding = $$new_props.padding);
    		if ("$$scope" in $$new_props) $$invalidate(5, $$scope = $$new_props.$$scope);
    	};

    	let classes;

    	$$self.$$.update = () => {
    		 $$invalidate(0, classes = Utils.classNames(className, "card-content", { "card-content-padding": padding }, Mixins.colorClasses($$props)));
    	};

    	$$props = exclude_internal_props($$props);
    	return [classes, $$restProps, className, padding, $$props, $$scope, $$slots];
    }

    class Card_content extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance$5, create_fragment$5, safe_not_equal, { class: 2, padding: 3 });
    	}
    }

    /* public/packages/svelte/components/card-footer.svelte generated by Svelte v3.22.3 */

    function create_fragment$6(ctx) {
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

    function instance$6($$self, $$props, $$invalidate) {
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
    		 $$invalidate(0, classes = Utils.classNames(className, "card-footer", Mixins.colorClasses($$props)));
    	};

    	$$props = exclude_internal_props($$props);
    	return [classes, $$restProps, className, $$props, $$scope, $$slots];
    }

    class Card_footer extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance$6, create_fragment$6, safe_not_equal, { class: 2 });
    	}
    }

    /* public/packages/svelte/components/card-header.svelte generated by Svelte v3.22.3 */

    function create_fragment$7(ctx) {
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

    function instance$7($$self, $$props, $$invalidate) {
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
    		 $$invalidate(0, classes = Utils.classNames(className, "card-header", Mixins.colorClasses($$props)));
    	};

    	$$props = exclude_internal_props($$props);
    	return [classes, $$restProps, className, $$props, $$scope, $$slots];
    }

    class Card_header extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance$7, create_fragment$7, safe_not_equal, { class: 2 });
    	}
    }

    /* public/packages/svelte/components/card.svelte generated by Svelte v3.22.3 */
    const get_footer_slot_changes = dirty => ({});
    const get_footer_slot_context = ctx => ({});
    const get_content_slot_changes = dirty => ({});
    const get_content_slot_context = ctx => ({});
    const get_header_slot_changes = dirty => ({});
    const get_header_slot_context = ctx => ({});

    // (148:2) {#if typeof title !== 'undefined' || hasHeaderSlots}
    function create_if_block_2(ctx) {
    	let current;

    	const cardheader = new Card_header({
    			props: {
    				$$slots: { default: [create_default_slot_2] },
    				$$scope: { ctx }
    			}
    		});

    	return {
    		c() {
    			create_component(cardheader.$$.fragment);
    		},
    		m(target, anchor) {
    			mount_component(cardheader, target, anchor);
    			current = true;
    		},
    		p(ctx, dirty) {
    			const cardheader_changes = {};

    			if (dirty[0] & /*title*/ 1 | dirty[1] & /*$$scope*/ 256) {
    				cardheader_changes.$$scope = { dirty, ctx };
    			}

    			cardheader.$set(cardheader_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(cardheader.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(cardheader.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			destroy_component(cardheader, detaching);
    		}
    	};
    }

    // (149:4) <CardHeader>
    function create_default_slot_2(ctx) {
    	let t0_value = Utils.text(/*title*/ ctx[0]) + "";
    	let t0;
    	let t1;
    	let current;
    	const header_slot_template = /*$$slots*/ ctx[37].header;
    	const header_slot = create_slot(header_slot_template, ctx, /*$$scope*/ ctx[39], get_header_slot_context);

    	return {
    		c() {
    			t0 = text(t0_value);
    			t1 = space();
    			if (header_slot) header_slot.c();
    		},
    		m(target, anchor) {
    			insert(target, t0, anchor);
    			insert(target, t1, anchor);

    			if (header_slot) {
    				header_slot.m(target, anchor);
    			}

    			current = true;
    		},
    		p(ctx, dirty) {
    			if ((!current || dirty[0] & /*title*/ 1) && t0_value !== (t0_value = Utils.text(/*title*/ ctx[0]) + "")) set_data(t0, t0_value);

    			if (header_slot) {
    				if (header_slot.p && dirty[1] & /*$$scope*/ 256) {
    					header_slot.p(get_slot_context(header_slot_template, ctx, /*$$scope*/ ctx[39], get_header_slot_context), get_slot_changes(header_slot_template, /*$$scope*/ ctx[39], dirty, get_header_slot_changes));
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
    			if (detaching) detach(t0);
    			if (detaching) detach(t1);
    			if (header_slot) header_slot.d(detaching);
    		}
    	};
    }

    // (154:2) {#if typeof content !== 'undefined' || hasContentSlots}
    function create_if_block_1(ctx) {
    	let current;

    	const cardcontent = new Card_content({
    			props: {
    				padding: /*padding*/ ctx[12],
    				$$slots: { default: [create_default_slot_1] },
    				$$scope: { ctx }
    			}
    		});

    	return {
    		c() {
    			create_component(cardcontent.$$.fragment);
    		},
    		m(target, anchor) {
    			mount_component(cardcontent, target, anchor);
    			current = true;
    		},
    		p(ctx, dirty) {
    			const cardcontent_changes = {};
    			if (dirty[0] & /*padding*/ 4096) cardcontent_changes.padding = /*padding*/ ctx[12];

    			if (dirty[0] & /*content*/ 2 | dirty[1] & /*$$scope*/ 256) {
    				cardcontent_changes.$$scope = { dirty, ctx };
    			}

    			cardcontent.$set(cardcontent_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(cardcontent.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(cardcontent.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			destroy_component(cardcontent, detaching);
    		}
    	};
    }

    // (155:4) <CardContent padding={padding}>
    function create_default_slot_1(ctx) {
    	let t0_value = Utils.text(/*content*/ ctx[1]) + "";
    	let t0;
    	let t1;
    	let current;
    	const content_slot_template = /*$$slots*/ ctx[37].content;
    	const content_slot = create_slot(content_slot_template, ctx, /*$$scope*/ ctx[39], get_content_slot_context);

    	return {
    		c() {
    			t0 = text(t0_value);
    			t1 = space();
    			if (content_slot) content_slot.c();
    		},
    		m(target, anchor) {
    			insert(target, t0, anchor);
    			insert(target, t1, anchor);

    			if (content_slot) {
    				content_slot.m(target, anchor);
    			}

    			current = true;
    		},
    		p(ctx, dirty) {
    			if ((!current || dirty[0] & /*content*/ 2) && t0_value !== (t0_value = Utils.text(/*content*/ ctx[1]) + "")) set_data(t0, t0_value);

    			if (content_slot) {
    				if (content_slot.p && dirty[1] & /*$$scope*/ 256) {
    					content_slot.p(get_slot_context(content_slot_template, ctx, /*$$scope*/ ctx[39], get_content_slot_context), get_slot_changes(content_slot_template, /*$$scope*/ ctx[39], dirty, get_content_slot_changes));
    				}
    			}
    		},
    		i(local) {
    			if (current) return;
    			transition_in(content_slot, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(content_slot, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(t0);
    			if (detaching) detach(t1);
    			if (content_slot) content_slot.d(detaching);
    		}
    	};
    }

    // (160:2) {#if typeof footer !== 'undefined' || hasFooterSlots}
    function create_if_block(ctx) {
    	let current;

    	const cardfooter = new Card_footer({
    			props: {
    				$$slots: { default: [create_default_slot] },
    				$$scope: { ctx }
    			}
    		});

    	return {
    		c() {
    			create_component(cardfooter.$$.fragment);
    		},
    		m(target, anchor) {
    			mount_component(cardfooter, target, anchor);
    			current = true;
    		},
    		p(ctx, dirty) {
    			const cardfooter_changes = {};

    			if (dirty[0] & /*footer*/ 4 | dirty[1] & /*$$scope*/ 256) {
    				cardfooter_changes.$$scope = { dirty, ctx };
    			}

    			cardfooter.$set(cardfooter_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(cardfooter.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(cardfooter.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			destroy_component(cardfooter, detaching);
    		}
    	};
    }

    // (161:4) <CardFooter>
    function create_default_slot(ctx) {
    	let t0_value = Utils.text(/*footer*/ ctx[2]) + "";
    	let t0;
    	let t1;
    	let current;
    	const footer_slot_template = /*$$slots*/ ctx[37].footer;
    	const footer_slot = create_slot(footer_slot_template, ctx, /*$$scope*/ ctx[39], get_footer_slot_context);

    	return {
    		c() {
    			t0 = text(t0_value);
    			t1 = space();
    			if (footer_slot) footer_slot.c();
    		},
    		m(target, anchor) {
    			insert(target, t0, anchor);
    			insert(target, t1, anchor);

    			if (footer_slot) {
    				footer_slot.m(target, anchor);
    			}

    			current = true;
    		},
    		p(ctx, dirty) {
    			if ((!current || dirty[0] & /*footer*/ 4) && t0_value !== (t0_value = Utils.text(/*footer*/ ctx[2]) + "")) set_data(t0, t0_value);

    			if (footer_slot) {
    				if (footer_slot.p && dirty[1] & /*$$scope*/ 256) {
    					footer_slot.p(get_slot_context(footer_slot_template, ctx, /*$$scope*/ ctx[39], get_footer_slot_context), get_slot_changes(footer_slot_template, /*$$scope*/ ctx[39], dirty, get_footer_slot_changes));
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
    			if (detaching) detach(t0);
    			if (detaching) detach(t1);
    			if (footer_slot) footer_slot.d(detaching);
    		}
    	};
    }

    function create_fragment$8(ctx) {
    	let div;
    	let t0;
    	let t1;
    	let t2;
    	let current;
    	let if_block0 = (typeof /*title*/ ctx[0] !== "undefined" || /*hasHeaderSlots*/ ctx[15]) && create_if_block_2(ctx);
    	let if_block1 = (typeof /*content*/ ctx[1] !== "undefined" || /*hasContentSlots*/ ctx[16]) && create_if_block_1(ctx);
    	let if_block2 = (typeof /*footer*/ ctx[2] !== "undefined" || /*hasFooterSlots*/ ctx[17]) && create_if_block(ctx);
    	const default_slot_template = /*$$slots*/ ctx[37].default;
    	const default_slot = create_slot(default_slot_template, ctx, /*$$scope*/ ctx[39], null);

    	let div_levels = [
    		{ class: /*classes*/ ctx[14] },
    		{
    			"data-animate": typeof /*animate*/ ctx[3] === "undefined"
    			? /*animate*/ ctx[3]
    			: /*animate*/ ctx[3].toString()
    		},
    		{
    			"data-hide-navbar-on-open": typeof /*hideNavbarOnOpen*/ ctx[4] === "undefined"
    			? /*hideNavbarOnOpen*/ ctx[4]
    			: /*hideNavbarOnOpen*/ ctx[4].toString()
    		},
    		{
    			"data-hide-toolbar-on-open": typeof /*hideToolbarOnOpen*/ ctx[5] === "undefined"
    			? /*hideToolbarOnOpen*/ ctx[5]
    			: /*hideToolbarOnOpen*/ ctx[5].toString()
    		},
    		{
    			"data-hide-statusbar-on-open": typeof /*hideStatusbarOnOpen*/ ctx[6] === "undefined"
    			? /*hideStatusbarOnOpen*/ ctx[6]
    			: /*hideStatusbarOnOpen*/ ctx[6].toString()
    		},
    		{
    			"data-scrollable-el": /*scrollableEl*/ ctx[7]
    		},
    		{
    			"data-swipe-to-close": typeof /*swipeToClose*/ ctx[8] === "undefined"
    			? /*swipeToClose*/ ctx[8]
    			: /*swipeToClose*/ ctx[8].toString()
    		},
    		{
    			"data-close-by-backdrop-click": typeof /*closeByBackdropClick*/ ctx[9] === "undefined"
    			? /*closeByBackdropClick*/ ctx[9]
    			: /*closeByBackdropClick*/ ctx[9].toString()
    		},
    		{
    			"data-backdrop": typeof /*backdrop*/ ctx[10] === "undefined"
    			? /*backdrop*/ ctx[10]
    			: /*backdrop*/ ctx[10].toString()
    		},
    		{
    			"data-backdrop-el": /*backdropEl*/ ctx[11]
    		},
    		restProps(/*$$restProps*/ ctx[18])
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
    			if (if_block2) if_block2.c();
    			t2 = space();
    			if (default_slot) default_slot.c();
    			set_attributes(div, div_data);
    		},
    		m(target, anchor) {
    			insert(target, div, anchor);
    			if (if_block0) if_block0.m(div, null);
    			append(div, t0);
    			if (if_block1) if_block1.m(div, null);
    			append(div, t1);
    			if (if_block2) if_block2.m(div, null);
    			append(div, t2);

    			if (default_slot) {
    				default_slot.m(div, null);
    			}

    			/*div_binding*/ ctx[38](div);
    			current = true;
    		},
    		p(ctx, dirty) {
    			if (typeof /*title*/ ctx[0] !== "undefined" || /*hasHeaderSlots*/ ctx[15]) {
    				if (if_block0) {
    					if_block0.p(ctx, dirty);

    					if (dirty[0] & /*title, hasHeaderSlots*/ 32769) {
    						transition_in(if_block0, 1);
    					}
    				} else {
    					if_block0 = create_if_block_2(ctx);
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

    			if (typeof /*content*/ ctx[1] !== "undefined" || /*hasContentSlots*/ ctx[16]) {
    				if (if_block1) {
    					if_block1.p(ctx, dirty);

    					if (dirty[0] & /*content, hasContentSlots*/ 65538) {
    						transition_in(if_block1, 1);
    					}
    				} else {
    					if_block1 = create_if_block_1(ctx);
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

    			if (typeof /*footer*/ ctx[2] !== "undefined" || /*hasFooterSlots*/ ctx[17]) {
    				if (if_block2) {
    					if_block2.p(ctx, dirty);

    					if (dirty[0] & /*footer, hasFooterSlots*/ 131076) {
    						transition_in(if_block2, 1);
    					}
    				} else {
    					if_block2 = create_if_block(ctx);
    					if_block2.c();
    					transition_in(if_block2, 1);
    					if_block2.m(div, t2);
    				}
    			} else if (if_block2) {
    				group_outros();

    				transition_out(if_block2, 1, 1, () => {
    					if_block2 = null;
    				});

    				check_outros();
    			}

    			if (default_slot) {
    				if (default_slot.p && dirty[1] & /*$$scope*/ 256) {
    					default_slot.p(get_slot_context(default_slot_template, ctx, /*$$scope*/ ctx[39], null), get_slot_changes(default_slot_template, /*$$scope*/ ctx[39], dirty, null));
    				}
    			}

    			set_attributes(div, get_spread_update(div_levels, [
    				dirty[0] & /*classes*/ 16384 && { class: /*classes*/ ctx[14] },
    				dirty[0] & /*animate*/ 8 && {
    					"data-animate": typeof /*animate*/ ctx[3] === "undefined"
    					? /*animate*/ ctx[3]
    					: /*animate*/ ctx[3].toString()
    				},
    				dirty[0] & /*hideNavbarOnOpen*/ 16 && {
    					"data-hide-navbar-on-open": typeof /*hideNavbarOnOpen*/ ctx[4] === "undefined"
    					? /*hideNavbarOnOpen*/ ctx[4]
    					: /*hideNavbarOnOpen*/ ctx[4].toString()
    				},
    				dirty[0] & /*hideToolbarOnOpen*/ 32 && {
    					"data-hide-toolbar-on-open": typeof /*hideToolbarOnOpen*/ ctx[5] === "undefined"
    					? /*hideToolbarOnOpen*/ ctx[5]
    					: /*hideToolbarOnOpen*/ ctx[5].toString()
    				},
    				dirty[0] & /*hideStatusbarOnOpen*/ 64 && {
    					"data-hide-statusbar-on-open": typeof /*hideStatusbarOnOpen*/ ctx[6] === "undefined"
    					? /*hideStatusbarOnOpen*/ ctx[6]
    					: /*hideStatusbarOnOpen*/ ctx[6].toString()
    				},
    				dirty[0] & /*scrollableEl*/ 128 && {
    					"data-scrollable-el": /*scrollableEl*/ ctx[7]
    				},
    				dirty[0] & /*swipeToClose*/ 256 && {
    					"data-swipe-to-close": typeof /*swipeToClose*/ ctx[8] === "undefined"
    					? /*swipeToClose*/ ctx[8]
    					: /*swipeToClose*/ ctx[8].toString()
    				},
    				dirty[0] & /*closeByBackdropClick*/ 512 && {
    					"data-close-by-backdrop-click": typeof /*closeByBackdropClick*/ ctx[9] === "undefined"
    					? /*closeByBackdropClick*/ ctx[9]
    					: /*closeByBackdropClick*/ ctx[9].toString()
    				},
    				dirty[0] & /*backdrop*/ 1024 && {
    					"data-backdrop": typeof /*backdrop*/ ctx[10] === "undefined"
    					? /*backdrop*/ ctx[10]
    					: /*backdrop*/ ctx[10].toString()
    				},
    				dirty[0] & /*backdropEl*/ 2048 && {
    					"data-backdrop-el": /*backdropEl*/ ctx[11]
    				},
    				dirty[0] & /*$$restProps*/ 262144 && restProps(/*$$restProps*/ ctx[18])
    			]));
    		},
    		i(local) {
    			if (current) return;
    			transition_in(if_block0);
    			transition_in(if_block1);
    			transition_in(if_block2);
    			transition_in(default_slot, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(if_block0);
    			transition_out(if_block1);
    			transition_out(if_block2);
    			transition_out(default_slot, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(div);
    			if (if_block0) if_block0.d();
    			if (if_block1) if_block1.d();
    			if (if_block2) if_block2.d();
    			if (default_slot) default_slot.d(detaching);
    			/*div_binding*/ ctx[38](null);
    		}
    	};
    }

    function instance$8($$self, $$props, $$invalidate) {
    	const omit_props_names = [
    		"class","title","content","footer","outline","expandable","expandableAnimateWidth","expandableOpened","animate","hideNavbarOnOpen","hideToolbarOnOpen","hideStatusbarOnOpen","scrollableEl","swipeToClose","closeByBackdropClick","backdrop","backdropEl","noShadow","noBorder","padding"
    	];

    	let $$restProps = compute_rest_props($$props, omit_props_names);
    	const dispatch = createEventDispatcher();
    	let { class: className = undefined } = $$props;
    	let { title = undefined } = $$props;
    	let { content = undefined } = $$props;
    	let { footer = undefined } = $$props;
    	let { outline = false } = $$props;
    	let { expandable = false } = $$props;
    	let { expandableAnimateWidth = false } = $$props;
    	let { expandableOpened = false } = $$props;
    	let { animate = undefined } = $$props;
    	let { hideNavbarOnOpen = undefined } = $$props;
    	let { hideToolbarOnOpen = undefined } = $$props;
    	let { hideStatusbarOnOpen = undefined } = $$props;
    	let { scrollableEl = undefined } = $$props;
    	let { swipeToClose = undefined } = $$props;
    	let { closeByBackdropClick = undefined } = $$props;
    	let { backdrop = undefined } = $$props;
    	let { backdropEl = undefined } = $$props;
    	let { noShadow = false } = $$props;
    	let { noBorder = false } = $$props;
    	let { padding = true } = $$props;
    	let el;

    	/* eslint-enable no-undef */
    	function open() {
    		f7.instance.card.open(el);
    	}

    	function close() {
    		f7.instance.card.close(el);
    	}

    	let initialWatched = false;

    	function watchOpened(openedPassed) {
    		if (!initialWatched) {
    			initialWatched = true;
    			return;
    		}

    		if (openedPassed) {
    			open();
    		} else {
    			close();
    		}
    	}

    	function onBeforeOpen(cardEl, prevent) {
    		if (cardEl !== el) return;
    		dispatch("cardBeforeOpen", [el, prevent]);
    		if (typeof $$props.onCardBeforeOpen === "function") $$props.onCardBeforeOpen(el, prevent);
    	}

    	function onOpen(cardEl) {
    		if (cardEl !== el) return;
    		dispatch("cardOpen", [el]);
    		if (typeof $$props.onCardOpen === "function") $$props.onCardOpen(el);
    	}

    	function onOpened(cardEl, pageEl) {
    		if (cardEl !== el) return;
    		dispatch("cardOpened", [el, pageEl]);
    		if (typeof $$props.onCardOpened === "function") $$props.onCardOpened(el, pageEl);
    	}

    	function onClose(cardEl) {
    		if (cardEl !== el) return;
    		dispatch("cardClose", [el]);
    		if (typeof $$props.onCardClose === "function") $$props.onCardClose(el);
    	}

    	function onClosed(cardEl, pageEl) {
    		if (cardEl !== el) return;
    		dispatch("cardClosed", [el, pageEl]);
    		if (typeof $$props.onCardClosed === "function") $$props.onCardClosed(el, pageEl);
    	}

    	onMount(() => {
    		if (!expandable) return;

    		f7.ready(() => {
    			f7.instance.on("cardBeforeOpen", onBeforeOpen);
    			f7.instance.on("cardOpen", onOpen);
    			f7.instance.on("cardOpened", onOpened);
    			f7.instance.on("cardClose", onClose);
    			f7.instance.on("cardClosed", onClosed);

    			if (expandable && expandableOpened && el) {
    				f7.instance.card.open(el, false);
    			}
    		});
    	});

    	onDestroy(() => {
    		if (!expandable) return;
    		if (!f7.instance || !el) return;
    		f7.instance.off("cardBeforeOpen", onBeforeOpen);
    		f7.instance.off("cardOpen", onOpen);
    		f7.instance.off("cardOpened", onOpened);
    		f7.instance.off("cardClose", onClose);
    		f7.instance.off("cardClosed", onClosed);
    	});

    	let { $$slots = {}, $$scope } = $$props;

    	function div_binding($$value) {
    		binding_callbacks[$$value ? "unshift" : "push"](() => {
    			$$invalidate(13, el = $$value);
    		});
    	}

    	$$self.$set = $$new_props => {
    		$$invalidate(36, $$props = assign(assign({}, $$props), exclude_internal_props($$new_props)));
    		$$invalidate(18, $$restProps = compute_rest_props($$props, omit_props_names));
    		if ("class" in $$new_props) $$invalidate(19, className = $$new_props.class);
    		if ("title" in $$new_props) $$invalidate(0, title = $$new_props.title);
    		if ("content" in $$new_props) $$invalidate(1, content = $$new_props.content);
    		if ("footer" in $$new_props) $$invalidate(2, footer = $$new_props.footer);
    		if ("outline" in $$new_props) $$invalidate(20, outline = $$new_props.outline);
    		if ("expandable" in $$new_props) $$invalidate(21, expandable = $$new_props.expandable);
    		if ("expandableAnimateWidth" in $$new_props) $$invalidate(22, expandableAnimateWidth = $$new_props.expandableAnimateWidth);
    		if ("expandableOpened" in $$new_props) $$invalidate(23, expandableOpened = $$new_props.expandableOpened);
    		if ("animate" in $$new_props) $$invalidate(3, animate = $$new_props.animate);
    		if ("hideNavbarOnOpen" in $$new_props) $$invalidate(4, hideNavbarOnOpen = $$new_props.hideNavbarOnOpen);
    		if ("hideToolbarOnOpen" in $$new_props) $$invalidate(5, hideToolbarOnOpen = $$new_props.hideToolbarOnOpen);
    		if ("hideStatusbarOnOpen" in $$new_props) $$invalidate(6, hideStatusbarOnOpen = $$new_props.hideStatusbarOnOpen);
    		if ("scrollableEl" in $$new_props) $$invalidate(7, scrollableEl = $$new_props.scrollableEl);
    		if ("swipeToClose" in $$new_props) $$invalidate(8, swipeToClose = $$new_props.swipeToClose);
    		if ("closeByBackdropClick" in $$new_props) $$invalidate(9, closeByBackdropClick = $$new_props.closeByBackdropClick);
    		if ("backdrop" in $$new_props) $$invalidate(10, backdrop = $$new_props.backdrop);
    		if ("backdropEl" in $$new_props) $$invalidate(11, backdropEl = $$new_props.backdropEl);
    		if ("noShadow" in $$new_props) $$invalidate(24, noShadow = $$new_props.noShadow);
    		if ("noBorder" in $$new_props) $$invalidate(25, noBorder = $$new_props.noBorder);
    		if ("padding" in $$new_props) $$invalidate(12, padding = $$new_props.padding);
    		if ("$$scope" in $$new_props) $$invalidate(39, $$scope = $$new_props.$$scope);
    	};

    	let classes;
    	let hasHeaderSlots;
    	let hasContentSlots;
    	let hasFooterSlots;

    	$$self.$$.update = () => {
    		 $$invalidate(14, classes = Utils.classNames(
    			className,
    			"card",
    			{
    				"card-outline": outline,
    				"card-expandable": expandable,
    				"card-expandable-animate-width": expandableAnimateWidth,
    				"no-shadow": noShadow,
    				"no-border": noBorder
    			},
    			Mixins.colorClasses($$props)
    		));

    		if ($$self.$$.dirty[0] & /*expandableOpened*/ 8388608) {
    			 watchOpened(expandableOpened);
    		}
    	};

    	 $$invalidate(15, hasHeaderSlots = hasSlots(arguments, "header"));
    	 $$invalidate(16, hasContentSlots = hasSlots(arguments, "content"));
    	 $$invalidate(17, hasFooterSlots = hasSlots(arguments, "footer"));
    	$$props = exclude_internal_props($$props);

    	return [
    		title,
    		content,
    		footer,
    		animate,
    		hideNavbarOnOpen,
    		hideToolbarOnOpen,
    		hideStatusbarOnOpen,
    		scrollableEl,
    		swipeToClose,
    		closeByBackdropClick,
    		backdrop,
    		backdropEl,
    		padding,
    		el,
    		classes,
    		hasHeaderSlots,
    		hasContentSlots,
    		hasFooterSlots,
    		$$restProps,
    		className,
    		outline,
    		expandable,
    		expandableAnimateWidth,
    		expandableOpened,
    		noShadow,
    		noBorder,
    		initialWatched,
    		dispatch,
    		open,
    		close,
    		watchOpened,
    		onBeforeOpen,
    		onOpen,
    		onOpened,
    		onClose,
    		onClosed,
    		$$props,
    		$$slots,
    		div_binding,
    		$$scope
    	];
    }

    class Card extends SvelteComponent {
    	constructor(options) {
    		super();

    		init(
    			this,
    			options,
    			instance$8,
    			create_fragment$8,
    			safe_not_equal,
    			{
    				class: 19,
    				title: 0,
    				content: 1,
    				footer: 2,
    				outline: 20,
    				expandable: 21,
    				expandableAnimateWidth: 22,
    				expandableOpened: 23,
    				animate: 3,
    				hideNavbarOnOpen: 4,
    				hideToolbarOnOpen: 5,
    				hideStatusbarOnOpen: 6,
    				scrollableEl: 7,
    				swipeToClose: 8,
    				closeByBackdropClick: 9,
    				backdrop: 10,
    				backdropEl: 11,
    				noShadow: 24,
    				noBorder: 25,
    				padding: 12
    			},
    			[-1, -1]
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
    				$$slots: { default: [create_default_slot_1$1] },
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
    function create_if_block_3(ctx) {
    	let current;

    	const badge_1 = new Badge({
    			props: {
    				color: /*badgeColor*/ ctx[2],
    				$$slots: { default: [create_default_slot_2$1] },
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
    function create_default_slot_2$1(ctx) {
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
    function create_default_slot_1$1(ctx) {
    	let if_block_anchor;
    	let current;
    	let if_block = /*iconBadge*/ ctx[3] && create_if_block_3(ctx);

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
    					if_block = create_if_block_3(ctx);
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
    function create_if_block$1(ctx) {
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
    				$$slots: { default: [create_default_slot$1] },
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
    function create_default_slot$1(ctx) {
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

    function create_fragment$9(ctx) {
    	let a;
    	let t0;
    	let t1;
    	let current;
    	let dispose;
    	let if_block0 = /*hasIcon*/ ctx[8] && create_if_block_2$1(ctx);
    	const default_slot_template = /*$$slots*/ ctx[33].default;
    	const default_slot = create_slot(default_slot_template, ctx, /*$$scope*/ ctx[35], null);
    	let if_block1 = (typeof /*text*/ ctx[0] !== "undefined" || typeof /*badge*/ ctx[1] !== "undefined") && create_if_block$1(ctx);
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
    					if_block1 = create_if_block$1(ctx);
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

    function instance$9($$self, $$props, $$invalidate) {
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
    			instance$9,
    			create_fragment$9,
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

    /* public/packages/svelte/components/list-item.svelte generated by Svelte v3.22.3 */
    const get_root_end_slot_changes = dirty => ({});
    const get_root_end_slot_context = ctx => ({});
    const get_root_slot_changes = dirty => ({});
    const get_root_slot_context = ctx => ({});
    const get_content_end_slot_changes_5 = dirty => ({});
    const get_content_end_slot_context_5 = ctx => ({});
    const get_content_slot_changes_5 = dirty => ({});
    const get_content_slot_context_5 = ctx => ({});
    const get_inner_end_slot_changes_5 = dirty => ({});
    const get_inner_end_slot_context_5 = ctx => ({});
    const get_inner_slot_changes_11 = dirty => ({});
    const get_inner_slot_context_11 = ctx => ({});
    const get_after_end_slot_changes_11 = dirty => ({});
    const get_after_end_slot_context_11 = ctx => ({});
    const get_after_slot_changes_11 = dirty => ({});
    const get_after_slot_context_11 = ctx => ({});
    const get_after_start_slot_changes_11 = dirty => ({});
    const get_after_start_slot_context_11 = ctx => ({});
    const get_after_title_slot_changes_11 = dirty => ({});
    const get_after_title_slot_context_11 = ctx => ({});
    const get_footer_slot_changes_11 = dirty => ({});
    const get_footer_slot_context_11 = ctx => ({});
    const get_title_slot_changes_11 = dirty => ({});
    const get_title_slot_context_11 = ctx => ({});
    const get_header_slot_changes_11 = dirty => ({});
    const get_header_slot_context_11 = ctx => ({});
    const get_before_title_slot_changes_11 = dirty => ({});
    const get_before_title_slot_context_11 = ctx => ({});
    const get_footer_slot_changes_10 = dirty => ({});
    const get_footer_slot_context_10 = ctx => ({});
    const get_inner_slot_changes_10 = dirty => ({});
    const get_inner_slot_context_10 = ctx => ({});
    const get_text_slot_changes_5 = dirty => ({});
    const get_text_slot_context_5 = ctx => ({});
    const get_subtitle_slot_changes_5 = dirty => ({});
    const get_subtitle_slot_context_5 = ctx => ({});
    const get_after_end_slot_changes_10 = dirty => ({});
    const get_after_end_slot_context_10 = ctx => ({});
    const get_after_slot_changes_10 = dirty => ({});
    const get_after_slot_context_10 = ctx => ({});
    const get_after_start_slot_changes_10 = dirty => ({});
    const get_after_start_slot_context_10 = ctx => ({});
    const get_after_title_slot_changes_10 = dirty => ({});
    const get_after_title_slot_context_10 = ctx => ({});
    const get_title_slot_changes_10 = dirty => ({});
    const get_title_slot_context_10 = ctx => ({});
    const get_before_title_slot_changes_10 = dirty => ({});
    const get_before_title_slot_context_10 = ctx => ({});
    const get_header_slot_changes_10 = dirty => ({});
    const get_header_slot_context_10 = ctx => ({});
    const get_inner_start_slot_changes_5 = dirty => ({});
    const get_inner_start_slot_context_5 = ctx => ({});
    const get_media_slot_changes_5 = dirty => ({});
    const get_media_slot_context_5 = ctx => ({});
    const get_content_start_slot_changes_5 = dirty => ({});
    const get_content_start_slot_context_5 = ctx => ({});
    const get_content_end_slot_changes_4 = dirty => ({});
    const get_content_end_slot_context_4 = ctx => ({});
    const get_content_slot_changes_4 = dirty => ({});
    const get_content_slot_context_4 = ctx => ({});
    const get_inner_end_slot_changes_4 = dirty => ({});
    const get_inner_end_slot_context_4 = ctx => ({});
    const get_inner_slot_changes_9 = dirty => ({});
    const get_inner_slot_context_9 = ctx => ({});
    const get_after_end_slot_changes_9 = dirty => ({});
    const get_after_end_slot_context_9 = ctx => ({});
    const get_after_slot_changes_9 = dirty => ({});
    const get_after_slot_context_9 = ctx => ({});
    const get_after_start_slot_changes_9 = dirty => ({});
    const get_after_start_slot_context_9 = ctx => ({});
    const get_after_title_slot_changes_9 = dirty => ({});
    const get_after_title_slot_context_9 = ctx => ({});
    const get_footer_slot_changes_9 = dirty => ({});
    const get_footer_slot_context_9 = ctx => ({});
    const get_title_slot_changes_9 = dirty => ({});
    const get_title_slot_context_9 = ctx => ({});
    const get_header_slot_changes_9 = dirty => ({});
    const get_header_slot_context_9 = ctx => ({});
    const get_before_title_slot_changes_9 = dirty => ({});
    const get_before_title_slot_context_9 = ctx => ({});
    const get_footer_slot_changes_8 = dirty => ({});
    const get_footer_slot_context_8 = ctx => ({});
    const get_inner_slot_changes_8 = dirty => ({});
    const get_inner_slot_context_8 = ctx => ({});
    const get_text_slot_changes_4 = dirty => ({});
    const get_text_slot_context_4 = ctx => ({});
    const get_subtitle_slot_changes_4 = dirty => ({});
    const get_subtitle_slot_context_4 = ctx => ({});
    const get_after_end_slot_changes_8 = dirty => ({});
    const get_after_end_slot_context_8 = ctx => ({});
    const get_after_slot_changes_8 = dirty => ({});
    const get_after_slot_context_8 = ctx => ({});
    const get_after_start_slot_changes_8 = dirty => ({});
    const get_after_start_slot_context_8 = ctx => ({});
    const get_after_title_slot_changes_8 = dirty => ({});
    const get_after_title_slot_context_8 = ctx => ({});
    const get_title_slot_changes_8 = dirty => ({});
    const get_title_slot_context_8 = ctx => ({});
    const get_before_title_slot_changes_8 = dirty => ({});
    const get_before_title_slot_context_8 = ctx => ({});
    const get_header_slot_changes_8 = dirty => ({});
    const get_header_slot_context_8 = ctx => ({});
    const get_inner_start_slot_changes_4 = dirty => ({});
    const get_inner_start_slot_context_4 = ctx => ({});
    const get_media_slot_changes_4 = dirty => ({});
    const get_media_slot_context_4 = ctx => ({});
    const get_content_start_slot_changes_4 = dirty => ({});
    const get_content_start_slot_context_4 = ctx => ({});
    const get_content_end_slot_changes_3 = dirty => ({});
    const get_content_end_slot_context_3 = ctx => ({});
    const get_content_slot_changes_3 = dirty => ({});
    const get_content_slot_context_3 = ctx => ({});
    const get_inner_end_slot_changes_3 = dirty => ({});
    const get_inner_end_slot_context_3 = ctx => ({});
    const get_inner_slot_changes_7 = dirty => ({});
    const get_inner_slot_context_7 = ctx => ({});
    const get_after_end_slot_changes_7 = dirty => ({});
    const get_after_end_slot_context_7 = ctx => ({});
    const get_after_slot_changes_7 = dirty => ({});
    const get_after_slot_context_7 = ctx => ({});
    const get_after_start_slot_changes_7 = dirty => ({});
    const get_after_start_slot_context_7 = ctx => ({});
    const get_after_title_slot_changes_7 = dirty => ({});
    const get_after_title_slot_context_7 = ctx => ({});
    const get_footer_slot_changes_7 = dirty => ({});
    const get_footer_slot_context_7 = ctx => ({});
    const get_title_slot_changes_7 = dirty => ({});
    const get_title_slot_context_7 = ctx => ({});
    const get_header_slot_changes_7 = dirty => ({});
    const get_header_slot_context_7 = ctx => ({});
    const get_before_title_slot_changes_7 = dirty => ({});
    const get_before_title_slot_context_7 = ctx => ({});
    const get_footer_slot_changes_6 = dirty => ({});
    const get_footer_slot_context_6 = ctx => ({});
    const get_inner_slot_changes_6 = dirty => ({});
    const get_inner_slot_context_6 = ctx => ({});
    const get_text_slot_changes_3 = dirty => ({});
    const get_text_slot_context_3 = ctx => ({});
    const get_subtitle_slot_changes_3 = dirty => ({});
    const get_subtitle_slot_context_3 = ctx => ({});
    const get_after_end_slot_changes_6 = dirty => ({});
    const get_after_end_slot_context_6 = ctx => ({});
    const get_after_slot_changes_6 = dirty => ({});
    const get_after_slot_context_6 = ctx => ({});
    const get_after_start_slot_changes_6 = dirty => ({});
    const get_after_start_slot_context_6 = ctx => ({});
    const get_after_title_slot_changes_6 = dirty => ({});
    const get_after_title_slot_context_6 = ctx => ({});
    const get_title_slot_changes_6 = dirty => ({});
    const get_title_slot_context_6 = ctx => ({});
    const get_before_title_slot_changes_6 = dirty => ({});
    const get_before_title_slot_context_6 = ctx => ({});
    const get_header_slot_changes_6 = dirty => ({});
    const get_header_slot_context_6 = ctx => ({});
    const get_inner_start_slot_changes_3 = dirty => ({});
    const get_inner_start_slot_context_3 = ctx => ({});
    const get_media_slot_changes_3 = dirty => ({});
    const get_media_slot_context_3 = ctx => ({});
    const get_content_start_slot_changes_3 = dirty => ({});
    const get_content_start_slot_context_3 = ctx => ({});
    const get_content_end_slot_changes_2 = dirty => ({});
    const get_content_end_slot_context_2 = ctx => ({});
    const get_content_slot_changes_2 = dirty => ({});
    const get_content_slot_context_2 = ctx => ({});
    const get_inner_end_slot_changes_2 = dirty => ({});
    const get_inner_end_slot_context_2 = ctx => ({});
    const get_inner_slot_changes_5 = dirty => ({});
    const get_inner_slot_context_5 = ctx => ({});
    const get_after_end_slot_changes_5 = dirty => ({});
    const get_after_end_slot_context_5 = ctx => ({});
    const get_after_slot_changes_5 = dirty => ({});
    const get_after_slot_context_5 = ctx => ({});
    const get_after_start_slot_changes_5 = dirty => ({});
    const get_after_start_slot_context_5 = ctx => ({});
    const get_after_title_slot_changes_5 = dirty => ({});
    const get_after_title_slot_context_5 = ctx => ({});
    const get_footer_slot_changes_5 = dirty => ({});
    const get_footer_slot_context_5 = ctx => ({});
    const get_title_slot_changes_5 = dirty => ({});
    const get_title_slot_context_5 = ctx => ({});
    const get_header_slot_changes_5 = dirty => ({});
    const get_header_slot_context_5 = ctx => ({});
    const get_before_title_slot_changes_5 = dirty => ({});
    const get_before_title_slot_context_5 = ctx => ({});
    const get_footer_slot_changes_4 = dirty => ({});
    const get_footer_slot_context_4 = ctx => ({});
    const get_inner_slot_changes_4 = dirty => ({});
    const get_inner_slot_context_4 = ctx => ({});
    const get_text_slot_changes_2 = dirty => ({});
    const get_text_slot_context_2 = ctx => ({});
    const get_subtitle_slot_changes_2 = dirty => ({});
    const get_subtitle_slot_context_2 = ctx => ({});
    const get_after_end_slot_changes_4 = dirty => ({});
    const get_after_end_slot_context_4 = ctx => ({});
    const get_after_slot_changes_4 = dirty => ({});
    const get_after_slot_context_4 = ctx => ({});
    const get_after_start_slot_changes_4 = dirty => ({});
    const get_after_start_slot_context_4 = ctx => ({});
    const get_after_title_slot_changes_4 = dirty => ({});
    const get_after_title_slot_context_4 = ctx => ({});
    const get_title_slot_changes_4 = dirty => ({});
    const get_title_slot_context_4 = ctx => ({});
    const get_before_title_slot_changes_4 = dirty => ({});
    const get_before_title_slot_context_4 = ctx => ({});
    const get_header_slot_changes_4 = dirty => ({});
    const get_header_slot_context_4 = ctx => ({});
    const get_inner_start_slot_changes_2 = dirty => ({});
    const get_inner_start_slot_context_2 = ctx => ({});
    const get_media_slot_changes_2 = dirty => ({});
    const get_media_slot_context_2 = ctx => ({});
    const get_content_start_slot_changes_2 = dirty => ({});
    const get_content_start_slot_context_2 = ctx => ({});
    const get_content_end_slot_changes_1 = dirty => ({});
    const get_content_end_slot_context_1 = ctx => ({});
    const get_content_slot_changes_1 = dirty => ({});
    const get_content_slot_context_1 = ctx => ({});
    const get_inner_end_slot_changes_1 = dirty => ({});
    const get_inner_end_slot_context_1 = ctx => ({});
    const get_inner_slot_changes_3 = dirty => ({});
    const get_inner_slot_context_3 = ctx => ({});
    const get_after_end_slot_changes_3 = dirty => ({});
    const get_after_end_slot_context_3 = ctx => ({});
    const get_after_slot_changes_3 = dirty => ({});
    const get_after_slot_context_3 = ctx => ({});
    const get_after_start_slot_changes_3 = dirty => ({});
    const get_after_start_slot_context_3 = ctx => ({});
    const get_after_title_slot_changes_3 = dirty => ({});
    const get_after_title_slot_context_3 = ctx => ({});
    const get_footer_slot_changes_3 = dirty => ({});
    const get_footer_slot_context_3 = ctx => ({});
    const get_title_slot_changes_3 = dirty => ({});
    const get_title_slot_context_3 = ctx => ({});
    const get_header_slot_changes_3 = dirty => ({});
    const get_header_slot_context_3 = ctx => ({});
    const get_before_title_slot_changes_3 = dirty => ({});
    const get_before_title_slot_context_3 = ctx => ({});
    const get_footer_slot_changes_2 = dirty => ({});
    const get_footer_slot_context_2 = ctx => ({});
    const get_inner_slot_changes_2 = dirty => ({});
    const get_inner_slot_context_2 = ctx => ({});
    const get_text_slot_changes_1 = dirty => ({});
    const get_text_slot_context_1 = ctx => ({});
    const get_subtitle_slot_changes_1 = dirty => ({});
    const get_subtitle_slot_context_1 = ctx => ({});
    const get_after_end_slot_changes_2 = dirty => ({});
    const get_after_end_slot_context_2 = ctx => ({});
    const get_after_slot_changes_2 = dirty => ({});
    const get_after_slot_context_2 = ctx => ({});
    const get_after_start_slot_changes_2 = dirty => ({});
    const get_after_start_slot_context_2 = ctx => ({});
    const get_after_title_slot_changes_2 = dirty => ({});
    const get_after_title_slot_context_2 = ctx => ({});
    const get_title_slot_changes_2 = dirty => ({});
    const get_title_slot_context_2 = ctx => ({});
    const get_before_title_slot_changes_2 = dirty => ({});
    const get_before_title_slot_context_2 = ctx => ({});
    const get_header_slot_changes_2 = dirty => ({});
    const get_header_slot_context_2 = ctx => ({});
    const get_inner_start_slot_changes_1 = dirty => ({});
    const get_inner_start_slot_context_1 = ctx => ({});
    const get_media_slot_changes_1 = dirty => ({});
    const get_media_slot_context_1 = ctx => ({});
    const get_content_start_slot_changes_1 = dirty => ({});
    const get_content_start_slot_context_1 = ctx => ({});
    const get_content_end_slot_changes = dirty => ({});
    const get_content_end_slot_context = ctx => ({});
    const get_content_slot_changes$1 = dirty => ({});
    const get_content_slot_context$1 = ctx => ({});
    const get_inner_end_slot_changes = dirty => ({});
    const get_inner_end_slot_context = ctx => ({});
    const get_inner_slot_changes_1 = dirty => ({});
    const get_inner_slot_context_1 = ctx => ({});
    const get_after_end_slot_changes_1 = dirty => ({});
    const get_after_end_slot_context_1 = ctx => ({});
    const get_after_slot_changes_1 = dirty => ({});
    const get_after_slot_context_1 = ctx => ({});
    const get_after_start_slot_changes_1 = dirty => ({});
    const get_after_start_slot_context_1 = ctx => ({});
    const get_after_title_slot_changes_1 = dirty => ({});
    const get_after_title_slot_context_1 = ctx => ({});
    const get_footer_slot_changes_1 = dirty => ({});
    const get_footer_slot_context_1 = ctx => ({});
    const get_title_slot_changes_1 = dirty => ({});
    const get_title_slot_context_1 = ctx => ({});
    const get_header_slot_changes_1 = dirty => ({});
    const get_header_slot_context_1 = ctx => ({});
    const get_before_title_slot_changes_1 = dirty => ({});
    const get_before_title_slot_context_1 = ctx => ({});
    const get_footer_slot_changes$1 = dirty => ({});
    const get_footer_slot_context$1 = ctx => ({});
    const get_inner_slot_changes = dirty => ({});
    const get_inner_slot_context = ctx => ({});
    const get_text_slot_changes = dirty => ({});
    const get_text_slot_context = ctx => ({});
    const get_subtitle_slot_changes = dirty => ({});
    const get_subtitle_slot_context = ctx => ({});
    const get_after_end_slot_changes = dirty => ({});
    const get_after_end_slot_context = ctx => ({});
    const get_after_slot_changes = dirty => ({});
    const get_after_slot_context = ctx => ({});
    const get_after_start_slot_changes = dirty => ({});
    const get_after_start_slot_context = ctx => ({});
    const get_after_title_slot_changes = dirty => ({});
    const get_after_title_slot_context = ctx => ({});
    const get_title_slot_changes = dirty => ({});
    const get_title_slot_context = ctx => ({});
    const get_before_title_slot_changes = dirty => ({});
    const get_before_title_slot_context = ctx => ({});
    const get_header_slot_changes$1 = dirty => ({});
    const get_header_slot_context$1 = ctx => ({});
    const get_inner_start_slot_changes = dirty => ({});
    const get_inner_start_slot_context = ctx => ({});
    const get_media_slot_changes = dirty => ({});
    const get_media_slot_context = ctx => ({});
    const get_content_start_slot_changes = dirty => ({});
    const get_content_start_slot_context = ctx => ({});
    const get_root_start_slot_changes = dirty => ({});
    const get_root_start_slot_context = ctx => ({});

    // (370:0) {:else}
    function create_else_block(ctx) {
    	let li;
    	let t0;
    	let current_block_type_index;
    	let if_block0;
    	let t1;
    	let t2;
    	let t3;
    	let t4;
    	let current;
    	const root_start_slot_template = /*$$slots*/ ctx[89]["root-start"];
    	const root_start_slot = create_slot(root_start_slot_template, ctx, /*$$scope*/ ctx[103], get_root_start_slot_context);
    	const if_block_creators = [create_if_block_4, create_if_block_67, create_else_block_7];
    	const if_blocks = [];

    	function select_block_type_1(ctx, dirty) {
    		if (/*swipeout*/ ctx[11]) return 0;
    		if (/*isLink*/ ctx[35]) return 1;
    		return 2;
    	}

    	current_block_type_index = select_block_type_1(ctx);
    	if_block0 = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);
    	let if_block1 = /*isSortable*/ ctx[28] && /*sortable*/ ctx[12] !== false && !/*isSortableOpposite*/ ctx[29] && create_if_block_3$1();
    	let if_block2 = (/*swipeout*/ ctx[11] || /*accordionItem*/ ctx[13]) && create_if_block_2$2(ctx);
    	const root_slot_template = /*$$slots*/ ctx[89].root;
    	const root_slot = create_slot(root_slot_template, ctx, /*$$scope*/ ctx[103], get_root_slot_context);
    	const root_end_slot_template = /*$$slots*/ ctx[89]["root-end"];
    	const root_end_slot = create_slot(root_end_slot_template, ctx, /*$$scope*/ ctx[103], get_root_end_slot_context);

    	let li_levels = [
    		{ class: /*liClasses*/ ctx[31] },
    		{
    			"data-virtual-list-index": /*virtualListIndex*/ ctx[22]
    		},
    		restProps(/*$$restProps*/ ctx[45])
    	];

    	let li_data = {};

    	for (let i = 0; i < li_levels.length; i += 1) {
    		li_data = assign(li_data, li_levels[i]);
    	}

    	return {
    		c() {
    			li = element("li");
    			if (root_start_slot) root_start_slot.c();
    			t0 = space();
    			if_block0.c();
    			t1 = space();
    			if (if_block1) if_block1.c();
    			t2 = space();
    			if (if_block2) if_block2.c();
    			t3 = space();
    			if (root_slot) root_slot.c();
    			t4 = space();
    			if (root_end_slot) root_end_slot.c();
    			set_attributes(li, li_data);
    		},
    		m(target, anchor) {
    			insert(target, li, anchor);

    			if (root_start_slot) {
    				root_start_slot.m(li, null);
    			}

    			append(li, t0);
    			if_blocks[current_block_type_index].m(li, null);
    			append(li, t1);
    			if (if_block1) if_block1.m(li, null);
    			append(li, t2);
    			if (if_block2) if_block2.m(li, null);
    			append(li, t3);

    			if (root_slot) {
    				root_slot.m(li, null);
    			}

    			append(li, t4);

    			if (root_end_slot) {
    				root_end_slot.m(li, null);
    			}

    			/*li_binding_2*/ ctx[102](li);
    			current = true;
    		},
    		p(ctx, dirty) {
    			if (root_start_slot) {
    				if (root_start_slot.p && dirty[3] & /*$$scope*/ 1024) {
    					root_start_slot.p(get_slot_context(root_start_slot_template, ctx, /*$$scope*/ ctx[103], get_root_start_slot_context), get_slot_changes(root_start_slot_template, /*$$scope*/ ctx[103], dirty, get_root_start_slot_changes));
    				}
    			}

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
    				if_block0.m(li, t1);
    			}

    			if (/*isSortable*/ ctx[28] && /*sortable*/ ctx[12] !== false && !/*isSortableOpposite*/ ctx[29]) {
    				if (if_block1) ; else {
    					if_block1 = create_if_block_3$1();
    					if_block1.c();
    					if_block1.m(li, t2);
    				}
    			} else if (if_block1) {
    				if_block1.d(1);
    				if_block1 = null;
    			}

    			if (/*swipeout*/ ctx[11] || /*accordionItem*/ ctx[13]) {
    				if (if_block2) {
    					if_block2.p(ctx, dirty);

    					if (dirty[0] & /*swipeout, accordionItem*/ 10240) {
    						transition_in(if_block2, 1);
    					}
    				} else {
    					if_block2 = create_if_block_2$2(ctx);
    					if_block2.c();
    					transition_in(if_block2, 1);
    					if_block2.m(li, t3);
    				}
    			} else if (if_block2) {
    				group_outros();

    				transition_out(if_block2, 1, 1, () => {
    					if_block2 = null;
    				});

    				check_outros();
    			}

    			if (root_slot) {
    				if (root_slot.p && dirty[3] & /*$$scope*/ 1024) {
    					root_slot.p(get_slot_context(root_slot_template, ctx, /*$$scope*/ ctx[103], get_root_slot_context), get_slot_changes(root_slot_template, /*$$scope*/ ctx[103], dirty, get_root_slot_changes));
    				}
    			}

    			if (root_end_slot) {
    				if (root_end_slot.p && dirty[3] & /*$$scope*/ 1024) {
    					root_end_slot.p(get_slot_context(root_end_slot_template, ctx, /*$$scope*/ ctx[103], get_root_end_slot_context), get_slot_changes(root_end_slot_template, /*$$scope*/ ctx[103], dirty, get_root_end_slot_changes));
    				}
    			}

    			set_attributes(li, get_spread_update(li_levels, [
    				dirty[1] & /*liClasses*/ 1 && { class: /*liClasses*/ ctx[31] },
    				dirty[0] & /*virtualListIndex*/ 4194304 && {
    					"data-virtual-list-index": /*virtualListIndex*/ ctx[22]
    				},
    				dirty[1] & /*$$restProps*/ 16384 && restProps(/*$$restProps*/ ctx[45])
    			]));
    		},
    		i(local) {
    			if (current) return;
    			transition_in(root_start_slot, local);
    			transition_in(if_block0);
    			transition_in(if_block2);
    			transition_in(root_slot, local);
    			transition_in(root_end_slot, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(root_start_slot, local);
    			transition_out(if_block0);
    			transition_out(if_block2);
    			transition_out(root_slot, local);
    			transition_out(root_end_slot, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(li);
    			if (root_start_slot) root_start_slot.d(detaching);
    			if_blocks[current_block_type_index].d();
    			if (if_block1) if_block1.d();
    			if (if_block2) if_block2.d();
    			if (root_slot) root_slot.d(detaching);
    			if (root_end_slot) root_end_slot.d(detaching);
    			/*li_binding_2*/ ctx[102](null);
    		}
    	};
    }

    // (365:19) 
    function create_if_block_1$2(ctx) {
    	let li;
    	let t0_value = Utils.text(/*title*/ ctx[0]) + "";
    	let t0;
    	let t1;
    	let current;
    	let dispose;
    	const default_slot_template = /*$$slots*/ ctx[89].default;
    	const default_slot = create_slot(default_slot_template, ctx, /*$$scope*/ ctx[103], null);

    	let li_levels = [
    		{ class: /*liClasses*/ ctx[31] },
    		{
    			"data-virtual-list-index": /*virtualListIndex*/ ctx[22]
    		},
    		restProps(/*$$restProps*/ ctx[45])
    	];

    	let li_data = {};

    	for (let i = 0; i < li_levels.length; i += 1) {
    		li_data = assign(li_data, li_levels[i]);
    	}

    	return {
    		c() {
    			li = element("li");
    			t0 = text(t0_value);
    			t1 = space();
    			if (default_slot) default_slot.c();
    			set_attributes(li, li_data);
    		},
    		m(target, anchor, remount) {
    			insert(target, li, anchor);
    			append(li, t0);
    			append(li, t1);

    			if (default_slot) {
    				default_slot.m(li, null);
    			}

    			/*li_binding_1*/ ctx[91](li);
    			current = true;
    			if (remount) dispose();
    			dispose = listen(li, "click", /*onClick*/ ctx[43]);
    		},
    		p(ctx, dirty) {
    			if ((!current || dirty[0] & /*title*/ 1) && t0_value !== (t0_value = Utils.text(/*title*/ ctx[0]) + "")) set_data(t0, t0_value);

    			if (default_slot) {
    				if (default_slot.p && dirty[3] & /*$$scope*/ 1024) {
    					default_slot.p(get_slot_context(default_slot_template, ctx, /*$$scope*/ ctx[103], null), get_slot_changes(default_slot_template, /*$$scope*/ ctx[103], dirty, null));
    				}
    			}

    			set_attributes(li, get_spread_update(li_levels, [
    				dirty[1] & /*liClasses*/ 1 && { class: /*liClasses*/ ctx[31] },
    				dirty[0] & /*virtualListIndex*/ 4194304 && {
    					"data-virtual-list-index": /*virtualListIndex*/ ctx[22]
    				},
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
    			if (detaching) detach(li);
    			if (default_slot) default_slot.d(detaching);
    			/*li_binding_1*/ ctx[91](null);
    			dispose();
    		}
    	};
    }

    // (361:0) {#if (divider || groupTitle)}
    function create_if_block$2(ctx) {
    	let li;
    	let span;
    	let current;
    	let dispose;
    	const default_slot_template = /*$$slots*/ ctx[89].default;
    	const default_slot = create_slot(default_slot_template, ctx, /*$$scope*/ ctx[103], null);
    	const default_slot_or_fallback = default_slot || fallback_block(ctx);

    	let li_levels = [
    		{ class: /*liClasses*/ ctx[31] },
    		{
    			"data-virtual-list-index": /*virtualListIndex*/ ctx[22]
    		},
    		restProps(/*$$restProps*/ ctx[45])
    	];

    	let li_data = {};

    	for (let i = 0; i < li_levels.length; i += 1) {
    		li_data = assign(li_data, li_levels[i]);
    	}

    	return {
    		c() {
    			li = element("li");
    			span = element("span");
    			if (default_slot_or_fallback) default_slot_or_fallback.c();
    			set_attributes(li, li_data);
    		},
    		m(target, anchor, remount) {
    			insert(target, li, anchor);
    			append(li, span);

    			if (default_slot_or_fallback) {
    				default_slot_or_fallback.m(span, null);
    			}

    			/*li_binding*/ ctx[90](li);
    			current = true;
    			if (remount) dispose();
    			dispose = listen(li, "click", /*onClick*/ ctx[43]);
    		},
    		p(ctx, dirty) {
    			if (default_slot) {
    				if (default_slot.p && dirty[3] & /*$$scope*/ 1024) {
    					default_slot.p(get_slot_context(default_slot_template, ctx, /*$$scope*/ ctx[103], null), get_slot_changes(default_slot_template, /*$$scope*/ ctx[103], dirty, null));
    				}
    			} else {
    				if (default_slot_or_fallback && default_slot_or_fallback.p && dirty[0] & /*title*/ 1) {
    					default_slot_or_fallback.p(ctx, dirty);
    				}
    			}

    			set_attributes(li, get_spread_update(li_levels, [
    				dirty[1] & /*liClasses*/ 1 && { class: /*liClasses*/ ctx[31] },
    				dirty[0] & /*virtualListIndex*/ 4194304 && {
    					"data-virtual-list-index": /*virtualListIndex*/ ctx[22]
    				},
    				dirty[1] & /*$$restProps*/ 16384 && restProps(/*$$restProps*/ ctx[45])
    			]));
    		},
    		i(local) {
    			if (current) return;
    			transition_in(default_slot_or_fallback, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(default_slot_or_fallback, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(li);
    			if (default_slot_or_fallback) default_slot_or_fallback.d(detaching);
    			/*li_binding*/ ctx[90](null);
    			dispose();
    		}
    	};
    }

    // (850:6) {:else}
    function create_else_block_7(ctx) {
    	let current_block_type_index;
    	let if_block;
    	let if_block_anchor;
    	let current;
    	const if_block_creators = [create_if_block_88, create_else_block_9];
    	const if_blocks = [];

    	function select_block_type_8(ctx, dirty) {
    		if (/*checkbox*/ ctx[14] || /*radio*/ ctx[15]) return 0;
    		return 1;
    	}

    	current_block_type_index = select_block_type_8(ctx);
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
    			current_block_type_index = select_block_type_8(ctx);

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

    // (734:6) {#if isLink}
    function create_if_block_67(ctx) {
    	let a;
    	let div1;
    	let t0;
    	let t1;
    	let t2;
    	let div0;
    	let t3;
    	let current_block_type_index;
    	let if_block2;
    	let t4;
    	let t5;
    	let t6;
    	let current;
    	let dispose;
    	const content_start_slot_template = /*$$slots*/ ctx[89]["content-start"];
    	const content_start_slot = create_slot(content_start_slot_template, ctx, /*$$scope*/ ctx[103], get_content_start_slot_context_3);
    	let if_block0 = /*isSortable*/ ctx[28] && /*sortable*/ ctx[12] !== false && /*isSortableOpposite*/ ctx[29] && create_if_block_87();
    	let if_block1 = /*hasMedia*/ ctx[36] && create_if_block_85(ctx);
    	const inner_start_slot_template = /*$$slots*/ ctx[89]["inner-start"];
    	const inner_start_slot = create_slot(inner_start_slot_template, ctx, /*$$scope*/ ctx[103], get_inner_start_slot_context_3);
    	const if_block_creators = [create_if_block_68, create_else_block_6];
    	const if_blocks = [];

    	function select_block_type_7(ctx, dirty) {
    		if (/*isMedia*/ ctx[27]) return 0;
    		return 1;
    	}

    	current_block_type_index = select_block_type_7(ctx);
    	if_block2 = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);
    	const inner_end_slot_template = /*$$slots*/ ctx[89]["inner-end"];
    	const inner_end_slot = create_slot(inner_end_slot_template, ctx, /*$$scope*/ ctx[103], get_inner_end_slot_context_3);
    	const content_slot_template = /*$$slots*/ ctx[89].content;
    	const content_slot = create_slot(content_slot_template, ctx, /*$$scope*/ ctx[103], get_content_slot_context_3);
    	const content_end_slot_template = /*$$slots*/ ctx[89]["content-end"];
    	const content_end_slot = create_slot(content_end_slot_template, ctx, /*$$scope*/ ctx[103], get_content_end_slot_context_3);
    	let a_levels = [{ class: /*linkClasses*/ ctx[33] }, /*linkAttrs*/ ctx[34]];
    	let a_data = {};

    	for (let i = 0; i < a_levels.length; i += 1) {
    		a_data = assign(a_data, a_levels[i]);
    	}

    	return {
    		c() {
    			a = element("a");
    			div1 = element("div");
    			if (content_start_slot) content_start_slot.c();
    			t0 = space();
    			if (if_block0) if_block0.c();
    			t1 = space();
    			if (if_block1) if_block1.c();
    			t2 = space();
    			div0 = element("div");
    			if (inner_start_slot) inner_start_slot.c();
    			t3 = space();
    			if_block2.c();
    			t4 = space();
    			if (inner_end_slot) inner_end_slot.c();
    			t5 = space();
    			if (content_slot) content_slot.c();
    			t6 = space();
    			if (content_end_slot) content_end_slot.c();
    			attr(div0, "class", "item-inner");
    			attr(div1, "class", /*contentClasses*/ ctx[32]);
    			set_attributes(a, a_data);
    		},
    		m(target, anchor, remount) {
    			insert(target, a, anchor);
    			append(a, div1);

    			if (content_start_slot) {
    				content_start_slot.m(div1, null);
    			}

    			append(div1, t0);
    			if (if_block0) if_block0.m(div1, null);
    			append(div1, t1);
    			if (if_block1) if_block1.m(div1, null);
    			append(div1, t2);
    			append(div1, div0);

    			if (inner_start_slot) {
    				inner_start_slot.m(div0, null);
    			}

    			append(div0, t3);
    			if_blocks[current_block_type_index].m(div0, null);
    			append(div0, t4);

    			if (inner_end_slot) {
    				inner_end_slot.m(div0, null);
    			}

    			/*div0_binding_2*/ ctx[97](div0);
    			append(div1, t5);

    			if (content_slot) {
    				content_slot.m(div1, null);
    			}

    			append(div1, t6);

    			if (content_end_slot) {
    				content_end_slot.m(div1, null);
    			}

    			/*a_binding_1*/ ctx[98](a);
    			current = true;
    			if (remount) dispose();
    			dispose = listen(a, "click", /*onClick*/ ctx[43]);
    		},
    		p(ctx, dirty) {
    			if (content_start_slot) {
    				if (content_start_slot.p && dirty[3] & /*$$scope*/ 1024) {
    					content_start_slot.p(get_slot_context(content_start_slot_template, ctx, /*$$scope*/ ctx[103], get_content_start_slot_context_3), get_slot_changes(content_start_slot_template, /*$$scope*/ ctx[103], dirty, get_content_start_slot_changes_3));
    				}
    			}

    			if (/*isSortable*/ ctx[28] && /*sortable*/ ctx[12] !== false && /*isSortableOpposite*/ ctx[29]) {
    				if (if_block0) ; else {
    					if_block0 = create_if_block_87();
    					if_block0.c();
    					if_block0.m(div1, t1);
    				}
    			} else if (if_block0) {
    				if_block0.d(1);
    				if_block0 = null;
    			}

    			if (/*hasMedia*/ ctx[36]) {
    				if (if_block1) {
    					if_block1.p(ctx, dirty);

    					if (dirty[1] & /*hasMedia*/ 32) {
    						transition_in(if_block1, 1);
    					}
    				} else {
    					if_block1 = create_if_block_85(ctx);
    					if_block1.c();
    					transition_in(if_block1, 1);
    					if_block1.m(div1, t2);
    				}
    			} else if (if_block1) {
    				group_outros();

    				transition_out(if_block1, 1, 1, () => {
    					if_block1 = null;
    				});

    				check_outros();
    			}

    			if (inner_start_slot) {
    				if (inner_start_slot.p && dirty[3] & /*$$scope*/ 1024) {
    					inner_start_slot.p(get_slot_context(inner_start_slot_template, ctx, /*$$scope*/ ctx[103], get_inner_start_slot_context_3), get_slot_changes(inner_start_slot_template, /*$$scope*/ ctx[103], dirty, get_inner_start_slot_changes_3));
    				}
    			}

    			let previous_block_index = current_block_type_index;
    			current_block_type_index = select_block_type_7(ctx);

    			if (current_block_type_index === previous_block_index) {
    				if_blocks[current_block_type_index].p(ctx, dirty);
    			} else {
    				group_outros();

    				transition_out(if_blocks[previous_block_index], 1, 1, () => {
    					if_blocks[previous_block_index] = null;
    				});

    				check_outros();
    				if_block2 = if_blocks[current_block_type_index];

    				if (!if_block2) {
    					if_block2 = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);
    					if_block2.c();
    				}

    				transition_in(if_block2, 1);
    				if_block2.m(div0, t4);
    			}

    			if (inner_end_slot) {
    				if (inner_end_slot.p && dirty[3] & /*$$scope*/ 1024) {
    					inner_end_slot.p(get_slot_context(inner_end_slot_template, ctx, /*$$scope*/ ctx[103], get_inner_end_slot_context_3), get_slot_changes(inner_end_slot_template, /*$$scope*/ ctx[103], dirty, get_inner_end_slot_changes_3));
    				}
    			}

    			if (content_slot) {
    				if (content_slot.p && dirty[3] & /*$$scope*/ 1024) {
    					content_slot.p(get_slot_context(content_slot_template, ctx, /*$$scope*/ ctx[103], get_content_slot_context_3), get_slot_changes(content_slot_template, /*$$scope*/ ctx[103], dirty, get_content_slot_changes_3));
    				}
    			}

    			if (content_end_slot) {
    				if (content_end_slot.p && dirty[3] & /*$$scope*/ 1024) {
    					content_end_slot.p(get_slot_context(content_end_slot_template, ctx, /*$$scope*/ ctx[103], get_content_end_slot_context_3), get_slot_changes(content_end_slot_template, /*$$scope*/ ctx[103], dirty, get_content_end_slot_changes_3));
    				}
    			}

    			if (!current || dirty[1] & /*contentClasses*/ 2) {
    				attr(div1, "class", /*contentClasses*/ ctx[32]);
    			}

    			set_attributes(a, get_spread_update(a_levels, [
    				dirty[1] & /*linkClasses*/ 4 && { class: /*linkClasses*/ ctx[33] },
    				dirty[1] & /*linkAttrs*/ 8 && /*linkAttrs*/ ctx[34]
    			]));
    		},
    		i(local) {
    			if (current) return;
    			transition_in(content_start_slot, local);
    			transition_in(if_block1);
    			transition_in(inner_start_slot, local);
    			transition_in(if_block2);
    			transition_in(inner_end_slot, local);
    			transition_in(content_slot, local);
    			transition_in(content_end_slot, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(content_start_slot, local);
    			transition_out(if_block1);
    			transition_out(inner_start_slot, local);
    			transition_out(if_block2);
    			transition_out(inner_end_slot, local);
    			transition_out(content_slot, local);
    			transition_out(content_end_slot, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(a);
    			if (content_start_slot) content_start_slot.d(detaching);
    			if (if_block0) if_block0.d();
    			if (if_block1) if_block1.d();
    			if (inner_start_slot) inner_start_slot.d(detaching);
    			if_blocks[current_block_type_index].d();
    			if (inner_end_slot) inner_end_slot.d(detaching);
    			/*div0_binding_2*/ ctx[97](null);
    			if (content_slot) content_slot.d(detaching);
    			if (content_end_slot) content_end_slot.d(detaching);
    			/*a_binding_1*/ ctx[98](null);
    			dispose();
    		}
    	};
    }

    // (373:4) {#if swipeout}
    function create_if_block_4(ctx) {
    	let div;
    	let current_block_type_index;
    	let if_block;
    	let current;
    	const if_block_creators = [create_if_block_5, create_else_block_2];
    	const if_blocks = [];

    	function select_block_type_2(ctx, dirty) {
    		if (/*isLink*/ ctx[35]) return 0;
    		return 1;
    	}

    	current_block_type_index = select_block_type_2(ctx);
    	if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);

    	return {
    		c() {
    			div = element("div");
    			if_block.c();
    			attr(div, "class", "swipeout-content");
    		},
    		m(target, anchor) {
    			insert(target, div, anchor);
    			if_blocks[current_block_type_index].m(div, null);
    			current = true;
    		},
    		p(ctx, dirty) {
    			let previous_block_index = current_block_type_index;
    			current_block_type_index = select_block_type_2(ctx);

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
    			if (detaching) detach(div);
    			if_blocks[current_block_type_index].d();
    		}
    	};
    }

    // (976:8) {:else}
    function create_else_block_9(ctx) {
    	let div1;
    	let t0;
    	let t1;
    	let t2;
    	let div0;
    	let t3;
    	let current_block_type_index;
    	let if_block2;
    	let t4;
    	let t5;
    	let t6;
    	let current;
    	let dispose;
    	const content_start_slot_template = /*$$slots*/ ctx[89]["content-start"];
    	const content_start_slot = create_slot(content_start_slot_template, ctx, /*$$scope*/ ctx[103], get_content_start_slot_context_5);
    	let if_block0 = /*isSortable*/ ctx[28] && /*sortable*/ ctx[12] !== false && /*isSortableOpposite*/ ctx[29] && create_if_block_128();
    	let if_block1 = /*hasMedia*/ ctx[36] && create_if_block_126(ctx);
    	const inner_start_slot_template = /*$$slots*/ ctx[89]["inner-start"];
    	const inner_start_slot = create_slot(inner_start_slot_template, ctx, /*$$scope*/ ctx[103], get_inner_start_slot_context_5);
    	const if_block_creators = [create_if_block_109, create_else_block_10];
    	const if_blocks = [];

    	function select_block_type_10(ctx, dirty) {
    		if (/*isMedia*/ ctx[27]) return 0;
    		return 1;
    	}

    	current_block_type_index = select_block_type_10(ctx);
    	if_block2 = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);
    	const inner_end_slot_template = /*$$slots*/ ctx[89]["inner-end"];
    	const inner_end_slot = create_slot(inner_end_slot_template, ctx, /*$$scope*/ ctx[103], get_inner_end_slot_context_5);
    	const content_slot_template = /*$$slots*/ ctx[89].content;
    	const content_slot = create_slot(content_slot_template, ctx, /*$$scope*/ ctx[103], get_content_slot_context_5);
    	const content_end_slot_template = /*$$slots*/ ctx[89]["content-end"];
    	const content_end_slot = create_slot(content_end_slot_template, ctx, /*$$scope*/ ctx[103], get_content_end_slot_context_5);

    	return {
    		c() {
    			div1 = element("div");
    			if (content_start_slot) content_start_slot.c();
    			t0 = space();
    			if (if_block0) if_block0.c();
    			t1 = space();
    			if (if_block1) if_block1.c();
    			t2 = space();
    			div0 = element("div");
    			if (inner_start_slot) inner_start_slot.c();
    			t3 = space();
    			if_block2.c();
    			t4 = space();
    			if (inner_end_slot) inner_end_slot.c();
    			t5 = space();
    			if (content_slot) content_slot.c();
    			t6 = space();
    			if (content_end_slot) content_end_slot.c();
    			attr(div0, "class", "item-inner");
    			attr(div1, "class", /*contentClasses*/ ctx[32]);
    		},
    		m(target, anchor, remount) {
    			insert(target, div1, anchor);

    			if (content_start_slot) {
    				content_start_slot.m(div1, null);
    			}

    			append(div1, t0);
    			if (if_block0) if_block0.m(div1, null);
    			append(div1, t1);
    			if (if_block1) if_block1.m(div1, null);
    			append(div1, t2);
    			append(div1, div0);

    			if (inner_start_slot) {
    				inner_start_slot.m(div0, null);
    			}

    			append(div0, t3);
    			if_blocks[current_block_type_index].m(div0, null);
    			append(div0, t4);

    			if (inner_end_slot) {
    				inner_end_slot.m(div0, null);
    			}

    			/*div0_binding_3*/ ctx[101](div0);
    			append(div1, t5);

    			if (content_slot) {
    				content_slot.m(div1, null);
    			}

    			append(div1, t6);

    			if (content_end_slot) {
    				content_end_slot.m(div1, null);
    			}

    			current = true;
    			if (remount) dispose();
    			dispose = listen(div1, "click", /*onClick*/ ctx[43]);
    		},
    		p(ctx, dirty) {
    			if (content_start_slot) {
    				if (content_start_slot.p && dirty[3] & /*$$scope*/ 1024) {
    					content_start_slot.p(get_slot_context(content_start_slot_template, ctx, /*$$scope*/ ctx[103], get_content_start_slot_context_5), get_slot_changes(content_start_slot_template, /*$$scope*/ ctx[103], dirty, get_content_start_slot_changes_5));
    				}
    			}

    			if (/*isSortable*/ ctx[28] && /*sortable*/ ctx[12] !== false && /*isSortableOpposite*/ ctx[29]) {
    				if (if_block0) ; else {
    					if_block0 = create_if_block_128();
    					if_block0.c();
    					if_block0.m(div1, t1);
    				}
    			} else if (if_block0) {
    				if_block0.d(1);
    				if_block0 = null;
    			}

    			if (/*hasMedia*/ ctx[36]) {
    				if (if_block1) {
    					if_block1.p(ctx, dirty);

    					if (dirty[1] & /*hasMedia*/ 32) {
    						transition_in(if_block1, 1);
    					}
    				} else {
    					if_block1 = create_if_block_126(ctx);
    					if_block1.c();
    					transition_in(if_block1, 1);
    					if_block1.m(div1, t2);
    				}
    			} else if (if_block1) {
    				group_outros();

    				transition_out(if_block1, 1, 1, () => {
    					if_block1 = null;
    				});

    				check_outros();
    			}

    			if (inner_start_slot) {
    				if (inner_start_slot.p && dirty[3] & /*$$scope*/ 1024) {
    					inner_start_slot.p(get_slot_context(inner_start_slot_template, ctx, /*$$scope*/ ctx[103], get_inner_start_slot_context_5), get_slot_changes(inner_start_slot_template, /*$$scope*/ ctx[103], dirty, get_inner_start_slot_changes_5));
    				}
    			}

    			let previous_block_index = current_block_type_index;
    			current_block_type_index = select_block_type_10(ctx);

    			if (current_block_type_index === previous_block_index) {
    				if_blocks[current_block_type_index].p(ctx, dirty);
    			} else {
    				group_outros();

    				transition_out(if_blocks[previous_block_index], 1, 1, () => {
    					if_blocks[previous_block_index] = null;
    				});

    				check_outros();
    				if_block2 = if_blocks[current_block_type_index];

    				if (!if_block2) {
    					if_block2 = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);
    					if_block2.c();
    				}

    				transition_in(if_block2, 1);
    				if_block2.m(div0, t4);
    			}

    			if (inner_end_slot) {
    				if (inner_end_slot.p && dirty[3] & /*$$scope*/ 1024) {
    					inner_end_slot.p(get_slot_context(inner_end_slot_template, ctx, /*$$scope*/ ctx[103], get_inner_end_slot_context_5), get_slot_changes(inner_end_slot_template, /*$$scope*/ ctx[103], dirty, get_inner_end_slot_changes_5));
    				}
    			}

    			if (content_slot) {
    				if (content_slot.p && dirty[3] & /*$$scope*/ 1024) {
    					content_slot.p(get_slot_context(content_slot_template, ctx, /*$$scope*/ ctx[103], get_content_slot_context_5), get_slot_changes(content_slot_template, /*$$scope*/ ctx[103], dirty, get_content_slot_changes_5));
    				}
    			}

    			if (content_end_slot) {
    				if (content_end_slot.p && dirty[3] & /*$$scope*/ 1024) {
    					content_end_slot.p(get_slot_context(content_end_slot_template, ctx, /*$$scope*/ ctx[103], get_content_end_slot_context_5), get_slot_changes(content_end_slot_template, /*$$scope*/ ctx[103], dirty, get_content_end_slot_changes_5));
    				}
    			}

    			if (!current || dirty[1] & /*contentClasses*/ 2) {
    				attr(div1, "class", /*contentClasses*/ ctx[32]);
    			}
    		},
    		i(local) {
    			if (current) return;
    			transition_in(content_start_slot, local);
    			transition_in(if_block1);
    			transition_in(inner_start_slot, local);
    			transition_in(if_block2);
    			transition_in(inner_end_slot, local);
    			transition_in(content_slot, local);
    			transition_in(content_end_slot, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(content_start_slot, local);
    			transition_out(if_block1);
    			transition_out(inner_start_slot, local);
    			transition_out(if_block2);
    			transition_out(inner_end_slot, local);
    			transition_out(content_slot, local);
    			transition_out(content_end_slot, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(div1);
    			if (content_start_slot) content_start_slot.d(detaching);
    			if (if_block0) if_block0.d();
    			if (if_block1) if_block1.d();
    			if (inner_start_slot) inner_start_slot.d(detaching);
    			if_blocks[current_block_type_index].d();
    			if (inner_end_slot) inner_end_slot.d(detaching);
    			/*div0_binding_3*/ ctx[101](null);
    			if (content_slot) content_slot.d(detaching);
    			if (content_end_slot) content_end_slot.d(detaching);
    			dispose();
    		}
    	};
    }

    // (852:8) {#if checkbox || radio}
    function create_if_block_88(ctx) {
    	let label;
    	let t0;
    	let t1;
    	let input;
    	let input_value_value;
    	let input_type_value;
    	let t2;
    	let i;
    	let i_class_value;
    	let t3;
    	let t4;
    	let div;
    	let t5;
    	let current_block_type_index;
    	let if_block2;
    	let t6;
    	let t7;
    	let t8;
    	let current;
    	let dispose;
    	const content_start_slot_template = /*$$slots*/ ctx[89]["content-start"];
    	const content_start_slot = create_slot(content_start_slot_template, ctx, /*$$scope*/ ctx[103], get_content_start_slot_context_4);
    	let if_block0 = /*isSortable*/ ctx[28] && /*sortable*/ ctx[12] !== false && /*isSortableOpposite*/ ctx[29] && create_if_block_108();
    	let if_block1 = /*hasMedia*/ ctx[36] && create_if_block_106(ctx);
    	const inner_start_slot_template = /*$$slots*/ ctx[89]["inner-start"];
    	const inner_start_slot = create_slot(inner_start_slot_template, ctx, /*$$scope*/ ctx[103], get_inner_start_slot_context_4);
    	const if_block_creators = [create_if_block_89, create_else_block_8];
    	const if_blocks = [];

    	function select_block_type_9(ctx, dirty) {
    		if (/*isMedia*/ ctx[27]) return 0;
    		return 1;
    	}

    	current_block_type_index = select_block_type_9(ctx);
    	if_block2 = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);
    	const inner_end_slot_template = /*$$slots*/ ctx[89]["inner-end"];
    	const inner_end_slot = create_slot(inner_end_slot_template, ctx, /*$$scope*/ ctx[103], get_inner_end_slot_context_4);
    	const content_slot_template = /*$$slots*/ ctx[89].content;
    	const content_slot = create_slot(content_slot_template, ctx, /*$$scope*/ ctx[103], get_content_slot_context_4);
    	const content_end_slot_template = /*$$slots*/ ctx[89]["content-end"];
    	const content_end_slot = create_slot(content_end_slot_template, ctx, /*$$scope*/ ctx[103], get_content_end_slot_context_4);

    	return {
    		c() {
    			label = element("label");
    			if (content_start_slot) content_start_slot.c();
    			t0 = space();
    			if (if_block0) if_block0.c();
    			t1 = space();
    			input = element("input");
    			t2 = space();
    			i = element("i");
    			t3 = space();
    			if (if_block1) if_block1.c();
    			t4 = space();
    			div = element("div");
    			if (inner_start_slot) inner_start_slot.c();
    			t5 = space();
    			if_block2.c();
    			t6 = space();
    			if (inner_end_slot) inner_end_slot.c();
    			t7 = space();
    			if (content_slot) content_slot.c();
    			t8 = space();
    			if (content_end_slot) content_end_slot.c();

    			input.value = input_value_value = typeof /*value*/ ctx[18] === "undefined"
    			? ""
    			: /*value*/ ctx[18];

    			attr(input, "name", /*name*/ ctx[17]);
    			input.checked = /*checked*/ ctx[16];
    			input.readOnly = /*readonly*/ ctx[19];
    			input.disabled = /*disabled*/ ctx[21];
    			input.required = /*required*/ ctx[20];
    			attr(input, "type", input_type_value = /*radio*/ ctx[15] ? "radio" : "checkbox");
    			attr(i, "class", i_class_value = `icon icon-${/*radio*/ ctx[15] ? "radio" : "checkbox"}`);
    			attr(div, "class", "item-inner");
    			attr(label, "class", /*contentClasses*/ ctx[32]);
    		},
    		m(target, anchor, remount) {
    			insert(target, label, anchor);

    			if (content_start_slot) {
    				content_start_slot.m(label, null);
    			}

    			append(label, t0);
    			if (if_block0) if_block0.m(label, null);
    			append(label, t1);
    			append(label, input);
    			/*input_binding_1*/ ctx[99](input);
    			append(label, t2);
    			append(label, i);
    			append(label, t3);
    			if (if_block1) if_block1.m(label, null);
    			append(label, t4);
    			append(label, div);

    			if (inner_start_slot) {
    				inner_start_slot.m(div, null);
    			}

    			append(div, t5);
    			if_blocks[current_block_type_index].m(div, null);
    			append(div, t6);

    			if (inner_end_slot) {
    				inner_end_slot.m(div, null);
    			}

    			/*div_binding_1*/ ctx[100](div);
    			append(label, t7);

    			if (content_slot) {
    				content_slot.m(label, null);
    			}

    			append(label, t8);

    			if (content_end_slot) {
    				content_end_slot.m(label, null);
    			}

    			current = true;
    			if (remount) run_all(dispose);

    			dispose = [
    				listen(input, "change", /*onChange*/ ctx[44]),
    				listen(label, "click", /*onClick*/ ctx[43])
    			];
    		},
    		p(ctx, dirty) {
    			if (content_start_slot) {
    				if (content_start_slot.p && dirty[3] & /*$$scope*/ 1024) {
    					content_start_slot.p(get_slot_context(content_start_slot_template, ctx, /*$$scope*/ ctx[103], get_content_start_slot_context_4), get_slot_changes(content_start_slot_template, /*$$scope*/ ctx[103], dirty, get_content_start_slot_changes_4));
    				}
    			}

    			if (/*isSortable*/ ctx[28] && /*sortable*/ ctx[12] !== false && /*isSortableOpposite*/ ctx[29]) {
    				if (if_block0) ; else {
    					if_block0 = create_if_block_108();
    					if_block0.c();
    					if_block0.m(label, t1);
    				}
    			} else if (if_block0) {
    				if_block0.d(1);
    				if_block0 = null;
    			}

    			if (!current || dirty[0] & /*value*/ 262144 && input_value_value !== (input_value_value = typeof /*value*/ ctx[18] === "undefined"
    			? ""
    			: /*value*/ ctx[18]) && input.value !== input_value_value) {
    				input.value = input_value_value;
    			}

    			if (!current || dirty[0] & /*name*/ 131072) {
    				attr(input, "name", /*name*/ ctx[17]);
    			}

    			if (!current || dirty[0] & /*checked*/ 65536) {
    				input.checked = /*checked*/ ctx[16];
    			}

    			if (!current || dirty[0] & /*readonly*/ 524288) {
    				input.readOnly = /*readonly*/ ctx[19];
    			}

    			if (!current || dirty[0] & /*disabled*/ 2097152) {
    				input.disabled = /*disabled*/ ctx[21];
    			}

    			if (!current || dirty[0] & /*required*/ 1048576) {
    				input.required = /*required*/ ctx[20];
    			}

    			if (!current || dirty[0] & /*radio*/ 32768 && input_type_value !== (input_type_value = /*radio*/ ctx[15] ? "radio" : "checkbox")) {
    				attr(input, "type", input_type_value);
    			}

    			if (!current || dirty[0] & /*radio*/ 32768 && i_class_value !== (i_class_value = `icon icon-${/*radio*/ ctx[15] ? "radio" : "checkbox"}`)) {
    				attr(i, "class", i_class_value);
    			}

    			if (/*hasMedia*/ ctx[36]) {
    				if (if_block1) {
    					if_block1.p(ctx, dirty);

    					if (dirty[1] & /*hasMedia*/ 32) {
    						transition_in(if_block1, 1);
    					}
    				} else {
    					if_block1 = create_if_block_106(ctx);
    					if_block1.c();
    					transition_in(if_block1, 1);
    					if_block1.m(label, t4);
    				}
    			} else if (if_block1) {
    				group_outros();

    				transition_out(if_block1, 1, 1, () => {
    					if_block1 = null;
    				});

    				check_outros();
    			}

    			if (inner_start_slot) {
    				if (inner_start_slot.p && dirty[3] & /*$$scope*/ 1024) {
    					inner_start_slot.p(get_slot_context(inner_start_slot_template, ctx, /*$$scope*/ ctx[103], get_inner_start_slot_context_4), get_slot_changes(inner_start_slot_template, /*$$scope*/ ctx[103], dirty, get_inner_start_slot_changes_4));
    				}
    			}

    			let previous_block_index = current_block_type_index;
    			current_block_type_index = select_block_type_9(ctx);

    			if (current_block_type_index === previous_block_index) {
    				if_blocks[current_block_type_index].p(ctx, dirty);
    			} else {
    				group_outros();

    				transition_out(if_blocks[previous_block_index], 1, 1, () => {
    					if_blocks[previous_block_index] = null;
    				});

    				check_outros();
    				if_block2 = if_blocks[current_block_type_index];

    				if (!if_block2) {
    					if_block2 = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);
    					if_block2.c();
    				}

    				transition_in(if_block2, 1);
    				if_block2.m(div, t6);
    			}

    			if (inner_end_slot) {
    				if (inner_end_slot.p && dirty[3] & /*$$scope*/ 1024) {
    					inner_end_slot.p(get_slot_context(inner_end_slot_template, ctx, /*$$scope*/ ctx[103], get_inner_end_slot_context_4), get_slot_changes(inner_end_slot_template, /*$$scope*/ ctx[103], dirty, get_inner_end_slot_changes_4));
    				}
    			}

    			if (content_slot) {
    				if (content_slot.p && dirty[3] & /*$$scope*/ 1024) {
    					content_slot.p(get_slot_context(content_slot_template, ctx, /*$$scope*/ ctx[103], get_content_slot_context_4), get_slot_changes(content_slot_template, /*$$scope*/ ctx[103], dirty, get_content_slot_changes_4));
    				}
    			}

    			if (content_end_slot) {
    				if (content_end_slot.p && dirty[3] & /*$$scope*/ 1024) {
    					content_end_slot.p(get_slot_context(content_end_slot_template, ctx, /*$$scope*/ ctx[103], get_content_end_slot_context_4), get_slot_changes(content_end_slot_template, /*$$scope*/ ctx[103], dirty, get_content_end_slot_changes_4));
    				}
    			}

    			if (!current || dirty[1] & /*contentClasses*/ 2) {
    				attr(label, "class", /*contentClasses*/ ctx[32]);
    			}
    		},
    		i(local) {
    			if (current) return;
    			transition_in(content_start_slot, local);
    			transition_in(if_block1);
    			transition_in(inner_start_slot, local);
    			transition_in(if_block2);
    			transition_in(inner_end_slot, local);
    			transition_in(content_slot, local);
    			transition_in(content_end_slot, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(content_start_slot, local);
    			transition_out(if_block1);
    			transition_out(inner_start_slot, local);
    			transition_out(if_block2);
    			transition_out(inner_end_slot, local);
    			transition_out(content_slot, local);
    			transition_out(content_end_slot, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(label);
    			if (content_start_slot) content_start_slot.d(detaching);
    			if (if_block0) if_block0.d();
    			/*input_binding_1*/ ctx[99](null);
    			if (if_block1) if_block1.d();
    			if (inner_start_slot) inner_start_slot.d(detaching);
    			if_blocks[current_block_type_index].d();
    			if (inner_end_slot) inner_end_slot.d(detaching);
    			/*div_binding_1*/ ctx[100](null);
    			if (content_slot) content_slot.d(detaching);
    			if (content_end_slot) content_end_slot.d(detaching);
    			run_all(dispose);
    		}
    	};
    }

    // (979:12) {#if isSortable && sortable !== false && isSortableOpposite}
    function create_if_block_128(ctx) {
    	let div;

    	return {
    		c() {
    			div = element("div");
    			attr(div, "class", "sortable-handler");
    		},
    		m(target, anchor) {
    			insert(target, div, anchor);
    		},
    		d(detaching) {
    			if (detaching) detach(div);
    		}
    	};
    }

    // (982:12) {#if hasMedia}
    function create_if_block_126(ctx) {
    	let div;
    	let t;
    	let current;
    	let if_block = typeof /*media*/ ctx[2] !== "undefined" && create_if_block_127(ctx);
    	const media_slot_template = /*$$slots*/ ctx[89].media;
    	const media_slot = create_slot(media_slot_template, ctx, /*$$scope*/ ctx[103], get_media_slot_context_5);

    	return {
    		c() {
    			div = element("div");
    			if (if_block) if_block.c();
    			t = space();
    			if (media_slot) media_slot.c();
    			attr(div, "class", "item-media");
    		},
    		m(target, anchor) {
    			insert(target, div, anchor);
    			if (if_block) if_block.m(div, null);
    			append(div, t);

    			if (media_slot) {
    				media_slot.m(div, null);
    			}

    			current = true;
    		},
    		p(ctx, dirty) {
    			if (typeof /*media*/ ctx[2] !== "undefined") {
    				if (if_block) {
    					if_block.p(ctx, dirty);
    				} else {
    					if_block = create_if_block_127(ctx);
    					if_block.c();
    					if_block.m(div, t);
    				}
    			} else if (if_block) {
    				if_block.d(1);
    				if_block = null;
    			}

    			if (media_slot) {
    				if (media_slot.p && dirty[3] & /*$$scope*/ 1024) {
    					media_slot.p(get_slot_context(media_slot_template, ctx, /*$$scope*/ ctx[103], get_media_slot_context_5), get_slot_changes(media_slot_template, /*$$scope*/ ctx[103], dirty, get_media_slot_changes_5));
    				}
    			}
    		},
    		i(local) {
    			if (current) return;
    			transition_in(media_slot, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(media_slot, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(div);
    			if (if_block) if_block.d();
    			if (media_slot) media_slot.d(detaching);
    		}
    	};
    }

    // (984:16) {#if typeof media !== 'undefined'}
    function create_if_block_127(ctx) {
    	let img;
    	let img_src_value;

    	return {
    		c() {
    			img = element("img");
    			if (img.src !== (img_src_value = /*media*/ ctx[2])) attr(img, "src", img_src_value);
    		},
    		m(target, anchor) {
    			insert(target, img, anchor);
    		},
    		p(ctx, dirty) {
    			if (dirty[0] & /*media*/ 4 && img.src !== (img_src_value = /*media*/ ctx[2])) {
    				attr(img, "src", img_src_value);
    			}
    		},
    		d(detaching) {
    			if (detaching) detach(img);
    		}
    	};
    }

    // (1044:14) {:else}
    function create_else_block_10(ctx) {
    	let t0;
    	let t1;
    	let t2;
    	let t3;
    	let t4;
    	let if_block2_anchor;
    	let current;
    	const before_title_slot_template = /*$$slots*/ ctx[89]["before-title"];
    	const before_title_slot = create_slot(before_title_slot_template, ctx, /*$$scope*/ ctx[103], get_before_title_slot_context_11);
    	let if_block0 = (/*hasTitle*/ ctx[37] || /*hasHeader*/ ctx[38] || /*hasFooter*/ ctx[39]) && create_if_block_123(ctx);
    	const after_title_slot_template = /*$$slots*/ ctx[89]["after-title"];
    	const after_title_slot = create_slot(after_title_slot_template, ctx, /*$$scope*/ ctx[103], get_after_title_slot_context_11);
    	let if_block1 = /*hasAfter*/ ctx[42] && create_if_block_120(ctx);
    	const inner_slot_template = /*$$slots*/ ctx[89].inner;
    	const inner_slot = create_slot(inner_slot_template, ctx, /*$$scope*/ ctx[103], get_inner_slot_context_11);
    	let if_block2 = !(/*swipeout*/ ctx[11] || /*accordionItem*/ ctx[13]) && create_if_block_119(ctx);

    	return {
    		c() {
    			if (before_title_slot) before_title_slot.c();
    			t0 = space();
    			if (if_block0) if_block0.c();
    			t1 = space();
    			if (after_title_slot) after_title_slot.c();
    			t2 = space();
    			if (if_block1) if_block1.c();
    			t3 = space();
    			if (inner_slot) inner_slot.c();
    			t4 = space();
    			if (if_block2) if_block2.c();
    			if_block2_anchor = empty();
    		},
    		m(target, anchor) {
    			if (before_title_slot) {
    				before_title_slot.m(target, anchor);
    			}

    			insert(target, t0, anchor);
    			if (if_block0) if_block0.m(target, anchor);
    			insert(target, t1, anchor);

    			if (after_title_slot) {
    				after_title_slot.m(target, anchor);
    			}

    			insert(target, t2, anchor);
    			if (if_block1) if_block1.m(target, anchor);
    			insert(target, t3, anchor);

    			if (inner_slot) {
    				inner_slot.m(target, anchor);
    			}

    			insert(target, t4, anchor);
    			if (if_block2) if_block2.m(target, anchor);
    			insert(target, if_block2_anchor, anchor);
    			current = true;
    		},
    		p(ctx, dirty) {
    			if (before_title_slot) {
    				if (before_title_slot.p && dirty[3] & /*$$scope*/ 1024) {
    					before_title_slot.p(get_slot_context(before_title_slot_template, ctx, /*$$scope*/ ctx[103], get_before_title_slot_context_11), get_slot_changes(before_title_slot_template, /*$$scope*/ ctx[103], dirty, get_before_title_slot_changes_11));
    				}
    			}

    			if (/*hasTitle*/ ctx[37] || /*hasHeader*/ ctx[38] || /*hasFooter*/ ctx[39]) {
    				if (if_block0) {
    					if_block0.p(ctx, dirty);

    					if (dirty[1] & /*hasTitle, hasHeader, hasFooter*/ 448) {
    						transition_in(if_block0, 1);
    					}
    				} else {
    					if_block0 = create_if_block_123(ctx);
    					if_block0.c();
    					transition_in(if_block0, 1);
    					if_block0.m(t1.parentNode, t1);
    				}
    			} else if (if_block0) {
    				group_outros();

    				transition_out(if_block0, 1, 1, () => {
    					if_block0 = null;
    				});

    				check_outros();
    			}

    			if (after_title_slot) {
    				if (after_title_slot.p && dirty[3] & /*$$scope*/ 1024) {
    					after_title_slot.p(get_slot_context(after_title_slot_template, ctx, /*$$scope*/ ctx[103], get_after_title_slot_context_11), get_slot_changes(after_title_slot_template, /*$$scope*/ ctx[103], dirty, get_after_title_slot_changes_11));
    				}
    			}

    			if (/*hasAfter*/ ctx[42]) {
    				if (if_block1) {
    					if_block1.p(ctx, dirty);

    					if (dirty[1] & /*hasAfter*/ 2048) {
    						transition_in(if_block1, 1);
    					}
    				} else {
    					if_block1 = create_if_block_120(ctx);
    					if_block1.c();
    					transition_in(if_block1, 1);
    					if_block1.m(t3.parentNode, t3);
    				}
    			} else if (if_block1) {
    				group_outros();

    				transition_out(if_block1, 1, 1, () => {
    					if_block1 = null;
    				});

    				check_outros();
    			}

    			if (inner_slot) {
    				if (inner_slot.p && dirty[3] & /*$$scope*/ 1024) {
    					inner_slot.p(get_slot_context(inner_slot_template, ctx, /*$$scope*/ ctx[103], get_inner_slot_context_11), get_slot_changes(inner_slot_template, /*$$scope*/ ctx[103], dirty, get_inner_slot_changes_11));
    				}
    			}

    			if (!(/*swipeout*/ ctx[11] || /*accordionItem*/ ctx[13])) {
    				if (if_block2) {
    					if_block2.p(ctx, dirty);

    					if (dirty[0] & /*swipeout, accordionItem*/ 10240) {
    						transition_in(if_block2, 1);
    					}
    				} else {
    					if_block2 = create_if_block_119(ctx);
    					if_block2.c();
    					transition_in(if_block2, 1);
    					if_block2.m(if_block2_anchor.parentNode, if_block2_anchor);
    				}
    			} else if (if_block2) {
    				group_outros();

    				transition_out(if_block2, 1, 1, () => {
    					if_block2 = null;
    				});

    				check_outros();
    			}
    		},
    		i(local) {
    			if (current) return;
    			transition_in(before_title_slot, local);
    			transition_in(if_block0);
    			transition_in(after_title_slot, local);
    			transition_in(if_block1);
    			transition_in(inner_slot, local);
    			transition_in(if_block2);
    			current = true;
    		},
    		o(local) {
    			transition_out(before_title_slot, local);
    			transition_out(if_block0);
    			transition_out(after_title_slot, local);
    			transition_out(if_block1);
    			transition_out(inner_slot, local);
    			transition_out(if_block2);
    			current = false;
    		},
    		d(detaching) {
    			if (before_title_slot) before_title_slot.d(detaching);
    			if (detaching) detach(t0);
    			if (if_block0) if_block0.d(detaching);
    			if (detaching) detach(t1);
    			if (after_title_slot) after_title_slot.d(detaching);
    			if (detaching) detach(t2);
    			if (if_block1) if_block1.d(detaching);
    			if (detaching) detach(t3);
    			if (inner_slot) inner_slot.d(detaching);
    			if (detaching) detach(t4);
    			if (if_block2) if_block2.d(detaching);
    			if (detaching) detach(if_block2_anchor);
    		}
    	};
    }

    // (992:14) {#if isMedia}
    function create_if_block_109(ctx) {
    	let t0;
    	let div;
    	let t1;
    	let t2;
    	let t3;
    	let t4;
    	let t5;
    	let t6;
    	let t7;
    	let t8;
    	let if_block6_anchor;
    	let current;
    	let if_block0 = /*hasHeader*/ ctx[38] && create_if_block_118(ctx);
    	const before_title_slot_template = /*$$slots*/ ctx[89]["before-title"];
    	const before_title_slot = create_slot(before_title_slot_template, ctx, /*$$scope*/ ctx[103], get_before_title_slot_context_10);
    	let if_block1 = /*hasTitle*/ ctx[37] && create_if_block_117(ctx);
    	const after_title_slot_template = /*$$slots*/ ctx[89]["after-title"];
    	const after_title_slot = create_slot(after_title_slot_template, ctx, /*$$scope*/ ctx[103], get_after_title_slot_context_10);
    	let if_block2 = /*hasAfter*/ ctx[42] && create_if_block_114(ctx);
    	let if_block3 = /*hasSubtitle*/ ctx[40] && create_if_block_113(ctx);
    	let if_block4 = /*hasText*/ ctx[41] && create_if_block_112(ctx);
    	const inner_slot_template = /*$$slots*/ ctx[89].inner;
    	const inner_slot = create_slot(inner_slot_template, ctx, /*$$scope*/ ctx[103], get_inner_slot_context_10);
    	let if_block5 = !(/*swipeout*/ ctx[11] || /*accordionItem*/ ctx[13]) && create_if_block_111(ctx);
    	let if_block6 = /*hasFooter*/ ctx[39] && create_if_block_110(ctx);

    	return {
    		c() {
    			if (if_block0) if_block0.c();
    			t0 = space();
    			div = element("div");
    			if (before_title_slot) before_title_slot.c();
    			t1 = space();
    			if (if_block1) if_block1.c();
    			t2 = space();
    			if (after_title_slot) after_title_slot.c();
    			t3 = space();
    			if (if_block2) if_block2.c();
    			t4 = space();
    			if (if_block3) if_block3.c();
    			t5 = space();
    			if (if_block4) if_block4.c();
    			t6 = space();
    			if (inner_slot) inner_slot.c();
    			t7 = space();
    			if (if_block5) if_block5.c();
    			t8 = space();
    			if (if_block6) if_block6.c();
    			if_block6_anchor = empty();
    			attr(div, "class", "item-title-row");
    		},
    		m(target, anchor) {
    			if (if_block0) if_block0.m(target, anchor);
    			insert(target, t0, anchor);
    			insert(target, div, anchor);

    			if (before_title_slot) {
    				before_title_slot.m(div, null);
    			}

    			append(div, t1);
    			if (if_block1) if_block1.m(div, null);
    			append(div, t2);

    			if (after_title_slot) {
    				after_title_slot.m(div, null);
    			}

    			append(div, t3);
    			if (if_block2) if_block2.m(div, null);
    			insert(target, t4, anchor);
    			if (if_block3) if_block3.m(target, anchor);
    			insert(target, t5, anchor);
    			if (if_block4) if_block4.m(target, anchor);
    			insert(target, t6, anchor);

    			if (inner_slot) {
    				inner_slot.m(target, anchor);
    			}

    			insert(target, t7, anchor);
    			if (if_block5) if_block5.m(target, anchor);
    			insert(target, t8, anchor);
    			if (if_block6) if_block6.m(target, anchor);
    			insert(target, if_block6_anchor, anchor);
    			current = true;
    		},
    		p(ctx, dirty) {
    			if (/*hasHeader*/ ctx[38]) {
    				if (if_block0) {
    					if_block0.p(ctx, dirty);

    					if (dirty[1] & /*hasHeader*/ 128) {
    						transition_in(if_block0, 1);
    					}
    				} else {
    					if_block0 = create_if_block_118(ctx);
    					if_block0.c();
    					transition_in(if_block0, 1);
    					if_block0.m(t0.parentNode, t0);
    				}
    			} else if (if_block0) {
    				group_outros();

    				transition_out(if_block0, 1, 1, () => {
    					if_block0 = null;
    				});

    				check_outros();
    			}

    			if (before_title_slot) {
    				if (before_title_slot.p && dirty[3] & /*$$scope*/ 1024) {
    					before_title_slot.p(get_slot_context(before_title_slot_template, ctx, /*$$scope*/ ctx[103], get_before_title_slot_context_10), get_slot_changes(before_title_slot_template, /*$$scope*/ ctx[103], dirty, get_before_title_slot_changes_10));
    				}
    			}

    			if (/*hasTitle*/ ctx[37]) {
    				if (if_block1) {
    					if_block1.p(ctx, dirty);

    					if (dirty[1] & /*hasTitle*/ 64) {
    						transition_in(if_block1, 1);
    					}
    				} else {
    					if_block1 = create_if_block_117(ctx);
    					if_block1.c();
    					transition_in(if_block1, 1);
    					if_block1.m(div, t2);
    				}
    			} else if (if_block1) {
    				group_outros();

    				transition_out(if_block1, 1, 1, () => {
    					if_block1 = null;
    				});

    				check_outros();
    			}

    			if (after_title_slot) {
    				if (after_title_slot.p && dirty[3] & /*$$scope*/ 1024) {
    					after_title_slot.p(get_slot_context(after_title_slot_template, ctx, /*$$scope*/ ctx[103], get_after_title_slot_context_10), get_slot_changes(after_title_slot_template, /*$$scope*/ ctx[103], dirty, get_after_title_slot_changes_10));
    				}
    			}

    			if (/*hasAfter*/ ctx[42]) {
    				if (if_block2) {
    					if_block2.p(ctx, dirty);

    					if (dirty[1] & /*hasAfter*/ 2048) {
    						transition_in(if_block2, 1);
    					}
    				} else {
    					if_block2 = create_if_block_114(ctx);
    					if_block2.c();
    					transition_in(if_block2, 1);
    					if_block2.m(div, null);
    				}
    			} else if (if_block2) {
    				group_outros();

    				transition_out(if_block2, 1, 1, () => {
    					if_block2 = null;
    				});

    				check_outros();
    			}

    			if (/*hasSubtitle*/ ctx[40]) {
    				if (if_block3) {
    					if_block3.p(ctx, dirty);

    					if (dirty[1] & /*hasSubtitle*/ 512) {
    						transition_in(if_block3, 1);
    					}
    				} else {
    					if_block3 = create_if_block_113(ctx);
    					if_block3.c();
    					transition_in(if_block3, 1);
    					if_block3.m(t5.parentNode, t5);
    				}
    			} else if (if_block3) {
    				group_outros();

    				transition_out(if_block3, 1, 1, () => {
    					if_block3 = null;
    				});

    				check_outros();
    			}

    			if (/*hasText*/ ctx[41]) {
    				if (if_block4) {
    					if_block4.p(ctx, dirty);

    					if (dirty[1] & /*hasText*/ 1024) {
    						transition_in(if_block4, 1);
    					}
    				} else {
    					if_block4 = create_if_block_112(ctx);
    					if_block4.c();
    					transition_in(if_block4, 1);
    					if_block4.m(t6.parentNode, t6);
    				}
    			} else if (if_block4) {
    				group_outros();

    				transition_out(if_block4, 1, 1, () => {
    					if_block4 = null;
    				});

    				check_outros();
    			}

    			if (inner_slot) {
    				if (inner_slot.p && dirty[3] & /*$$scope*/ 1024) {
    					inner_slot.p(get_slot_context(inner_slot_template, ctx, /*$$scope*/ ctx[103], get_inner_slot_context_10), get_slot_changes(inner_slot_template, /*$$scope*/ ctx[103], dirty, get_inner_slot_changes_10));
    				}
    			}

    			if (!(/*swipeout*/ ctx[11] || /*accordionItem*/ ctx[13])) {
    				if (if_block5) {
    					if_block5.p(ctx, dirty);

    					if (dirty[0] & /*swipeout, accordionItem*/ 10240) {
    						transition_in(if_block5, 1);
    					}
    				} else {
    					if_block5 = create_if_block_111(ctx);
    					if_block5.c();
    					transition_in(if_block5, 1);
    					if_block5.m(t8.parentNode, t8);
    				}
    			} else if (if_block5) {
    				group_outros();

    				transition_out(if_block5, 1, 1, () => {
    					if_block5 = null;
    				});

    				check_outros();
    			}

    			if (/*hasFooter*/ ctx[39]) {
    				if (if_block6) {
    					if_block6.p(ctx, dirty);

    					if (dirty[1] & /*hasFooter*/ 256) {
    						transition_in(if_block6, 1);
    					}
    				} else {
    					if_block6 = create_if_block_110(ctx);
    					if_block6.c();
    					transition_in(if_block6, 1);
    					if_block6.m(if_block6_anchor.parentNode, if_block6_anchor);
    				}
    			} else if (if_block6) {
    				group_outros();

    				transition_out(if_block6, 1, 1, () => {
    					if_block6 = null;
    				});

    				check_outros();
    			}
    		},
    		i(local) {
    			if (current) return;
    			transition_in(if_block0);
    			transition_in(before_title_slot, local);
    			transition_in(if_block1);
    			transition_in(after_title_slot, local);
    			transition_in(if_block2);
    			transition_in(if_block3);
    			transition_in(if_block4);
    			transition_in(inner_slot, local);
    			transition_in(if_block5);
    			transition_in(if_block6);
    			current = true;
    		},
    		o(local) {
    			transition_out(if_block0);
    			transition_out(before_title_slot, local);
    			transition_out(if_block1);
    			transition_out(after_title_slot, local);
    			transition_out(if_block2);
    			transition_out(if_block3);
    			transition_out(if_block4);
    			transition_out(inner_slot, local);
    			transition_out(if_block5);
    			transition_out(if_block6);
    			current = false;
    		},
    		d(detaching) {
    			if (if_block0) if_block0.d(detaching);
    			if (detaching) detach(t0);
    			if (detaching) detach(div);
    			if (before_title_slot) before_title_slot.d(detaching);
    			if (if_block1) if_block1.d();
    			if (after_title_slot) after_title_slot.d(detaching);
    			if (if_block2) if_block2.d();
    			if (detaching) detach(t4);
    			if (if_block3) if_block3.d(detaching);
    			if (detaching) detach(t5);
    			if (if_block4) if_block4.d(detaching);
    			if (detaching) detach(t6);
    			if (inner_slot) inner_slot.d(detaching);
    			if (detaching) detach(t7);
    			if (if_block5) if_block5.d(detaching);
    			if (detaching) detach(t8);
    			if (if_block6) if_block6.d(detaching);
    			if (detaching) detach(if_block6_anchor);
    		}
    	};
    }

    // (1046:16) {#if (hasTitle || hasHeader || hasFooter)}
    function create_if_block_123(ctx) {
    	let div;
    	let t0;
    	let t1_value = Utils.text(/*title*/ ctx[0]) + "";
    	let t1;
    	let t2;
    	let t3;
    	let current;
    	let if_block0 = /*hasHeader*/ ctx[38] && create_if_block_125(ctx);
    	const title_slot_template = /*$$slots*/ ctx[89].title;
    	const title_slot = create_slot(title_slot_template, ctx, /*$$scope*/ ctx[103], get_title_slot_context_11);
    	let if_block1 = /*hasFooter*/ ctx[39] && create_if_block_124(ctx);

    	return {
    		c() {
    			div = element("div");
    			if (if_block0) if_block0.c();
    			t0 = space();
    			t1 = text(t1_value);
    			t2 = space();
    			if (title_slot) title_slot.c();
    			t3 = space();
    			if (if_block1) if_block1.c();
    			attr(div, "class", "item-title");
    		},
    		m(target, anchor) {
    			insert(target, div, anchor);
    			if (if_block0) if_block0.m(div, null);
    			append(div, t0);
    			append(div, t1);
    			append(div, t2);

    			if (title_slot) {
    				title_slot.m(div, null);
    			}

    			append(div, t3);
    			if (if_block1) if_block1.m(div, null);
    			current = true;
    		},
    		p(ctx, dirty) {
    			if (/*hasHeader*/ ctx[38]) {
    				if (if_block0) {
    					if_block0.p(ctx, dirty);

    					if (dirty[1] & /*hasHeader*/ 128) {
    						transition_in(if_block0, 1);
    					}
    				} else {
    					if_block0 = create_if_block_125(ctx);
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

    			if ((!current || dirty[0] & /*title*/ 1) && t1_value !== (t1_value = Utils.text(/*title*/ ctx[0]) + "")) set_data(t1, t1_value);

    			if (title_slot) {
    				if (title_slot.p && dirty[3] & /*$$scope*/ 1024) {
    					title_slot.p(get_slot_context(title_slot_template, ctx, /*$$scope*/ ctx[103], get_title_slot_context_11), get_slot_changes(title_slot_template, /*$$scope*/ ctx[103], dirty, get_title_slot_changes_11));
    				}
    			}

    			if (/*hasFooter*/ ctx[39]) {
    				if (if_block1) {
    					if_block1.p(ctx, dirty);

    					if (dirty[1] & /*hasFooter*/ 256) {
    						transition_in(if_block1, 1);
    					}
    				} else {
    					if_block1 = create_if_block_124(ctx);
    					if_block1.c();
    					transition_in(if_block1, 1);
    					if_block1.m(div, null);
    				}
    			} else if (if_block1) {
    				group_outros();

    				transition_out(if_block1, 1, 1, () => {
    					if_block1 = null;
    				});

    				check_outros();
    			}
    		},
    		i(local) {
    			if (current) return;
    			transition_in(if_block0);
    			transition_in(title_slot, local);
    			transition_in(if_block1);
    			current = true;
    		},
    		o(local) {
    			transition_out(if_block0);
    			transition_out(title_slot, local);
    			transition_out(if_block1);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(div);
    			if (if_block0) if_block0.d();
    			if (title_slot) title_slot.d(detaching);
    			if (if_block1) if_block1.d();
    		}
    	};
    }

    // (1048:20) {#if hasHeader}
    function create_if_block_125(ctx) {
    	let div;
    	let t0_value = Utils.text(/*header*/ ctx[4]) + "";
    	let t0;
    	let t1;
    	let current;
    	const header_slot_template = /*$$slots*/ ctx[89].header;
    	const header_slot = create_slot(header_slot_template, ctx, /*$$scope*/ ctx[103], get_header_slot_context_11);

    	return {
    		c() {
    			div = element("div");
    			t0 = text(t0_value);
    			t1 = space();
    			if (header_slot) header_slot.c();
    			attr(div, "class", "item-header");
    		},
    		m(target, anchor) {
    			insert(target, div, anchor);
    			append(div, t0);
    			append(div, t1);

    			if (header_slot) {
    				header_slot.m(div, null);
    			}

    			current = true;
    		},
    		p(ctx, dirty) {
    			if ((!current || dirty[0] & /*header*/ 16) && t0_value !== (t0_value = Utils.text(/*header*/ ctx[4]) + "")) set_data(t0, t0_value);

    			if (header_slot) {
    				if (header_slot.p && dirty[3] & /*$$scope*/ 1024) {
    					header_slot.p(get_slot_context(header_slot_template, ctx, /*$$scope*/ ctx[103], get_header_slot_context_11), get_slot_changes(header_slot_template, /*$$scope*/ ctx[103], dirty, get_header_slot_changes_11));
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
    		}
    	};
    }

    // (1056:20) {#if hasFooter}
    function create_if_block_124(ctx) {
    	let div;
    	let t0_value = Utils.text(/*footer*/ ctx[5]) + "";
    	let t0;
    	let t1;
    	let current;
    	const footer_slot_template = /*$$slots*/ ctx[89].footer;
    	const footer_slot = create_slot(footer_slot_template, ctx, /*$$scope*/ ctx[103], get_footer_slot_context_11);

    	return {
    		c() {
    			div = element("div");
    			t0 = text(t0_value);
    			t1 = space();
    			if (footer_slot) footer_slot.c();
    			attr(div, "class", "item-footer");
    		},
    		m(target, anchor) {
    			insert(target, div, anchor);
    			append(div, t0);
    			append(div, t1);

    			if (footer_slot) {
    				footer_slot.m(div, null);
    			}

    			current = true;
    		},
    		p(ctx, dirty) {
    			if ((!current || dirty[0] & /*footer*/ 32) && t0_value !== (t0_value = Utils.text(/*footer*/ ctx[5]) + "")) set_data(t0, t0_value);

    			if (footer_slot) {
    				if (footer_slot.p && dirty[3] & /*$$scope*/ 1024) {
    					footer_slot.p(get_slot_context(footer_slot_template, ctx, /*$$scope*/ ctx[103], get_footer_slot_context_11), get_slot_changes(footer_slot_template, /*$$scope*/ ctx[103], dirty, get_footer_slot_changes_11));
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
    		}
    	};
    }

    // (1065:16) {#if hasAfter}
    function create_if_block_120(ctx) {
    	let div;
    	let t0;
    	let t1;
    	let t2;
    	let t3;
    	let current;
    	const after_start_slot_template = /*$$slots*/ ctx[89]["after-start"];
    	const after_start_slot = create_slot(after_start_slot_template, ctx, /*$$scope*/ ctx[103], get_after_start_slot_context_11);
    	let if_block0 = typeof /*after*/ ctx[6] !== "undefined" && create_if_block_122(ctx);
    	let if_block1 = typeof /*badge*/ ctx[7] !== "undefined" && create_if_block_121(ctx);
    	const after_slot_template = /*$$slots*/ ctx[89].after;
    	const after_slot = create_slot(after_slot_template, ctx, /*$$scope*/ ctx[103], get_after_slot_context_11);
    	const after_end_slot_template = /*$$slots*/ ctx[89]["after-end"];
    	const after_end_slot = create_slot(after_end_slot_template, ctx, /*$$scope*/ ctx[103], get_after_end_slot_context_11);

    	return {
    		c() {
    			div = element("div");
    			if (after_start_slot) after_start_slot.c();
    			t0 = space();
    			if (if_block0) if_block0.c();
    			t1 = space();
    			if (if_block1) if_block1.c();
    			t2 = space();
    			if (after_slot) after_slot.c();
    			t3 = space();
    			if (after_end_slot) after_end_slot.c();
    			attr(div, "class", "item-after");
    		},
    		m(target, anchor) {
    			insert(target, div, anchor);

    			if (after_start_slot) {
    				after_start_slot.m(div, null);
    			}

    			append(div, t0);
    			if (if_block0) if_block0.m(div, null);
    			append(div, t1);
    			if (if_block1) if_block1.m(div, null);
    			append(div, t2);

    			if (after_slot) {
    				after_slot.m(div, null);
    			}

    			append(div, t3);

    			if (after_end_slot) {
    				after_end_slot.m(div, null);
    			}

    			current = true;
    		},
    		p(ctx, dirty) {
    			if (after_start_slot) {
    				if (after_start_slot.p && dirty[3] & /*$$scope*/ 1024) {
    					after_start_slot.p(get_slot_context(after_start_slot_template, ctx, /*$$scope*/ ctx[103], get_after_start_slot_context_11), get_slot_changes(after_start_slot_template, /*$$scope*/ ctx[103], dirty, get_after_start_slot_changes_11));
    				}
    			}

    			if (typeof /*after*/ ctx[6] !== "undefined") {
    				if (if_block0) {
    					if_block0.p(ctx, dirty);
    				} else {
    					if_block0 = create_if_block_122(ctx);
    					if_block0.c();
    					if_block0.m(div, t1);
    				}
    			} else if (if_block0) {
    				if_block0.d(1);
    				if_block0 = null;
    			}

    			if (typeof /*badge*/ ctx[7] !== "undefined") {
    				if (if_block1) {
    					if_block1.p(ctx, dirty);

    					if (dirty[0] & /*badge*/ 128) {
    						transition_in(if_block1, 1);
    					}
    				} else {
    					if_block1 = create_if_block_121(ctx);
    					if_block1.c();
    					transition_in(if_block1, 1);
    					if_block1.m(div, t2);
    				}
    			} else if (if_block1) {
    				group_outros();

    				transition_out(if_block1, 1, 1, () => {
    					if_block1 = null;
    				});

    				check_outros();
    			}

    			if (after_slot) {
    				if (after_slot.p && dirty[3] & /*$$scope*/ 1024) {
    					after_slot.p(get_slot_context(after_slot_template, ctx, /*$$scope*/ ctx[103], get_after_slot_context_11), get_slot_changes(after_slot_template, /*$$scope*/ ctx[103], dirty, get_after_slot_changes_11));
    				}
    			}

    			if (after_end_slot) {
    				if (after_end_slot.p && dirty[3] & /*$$scope*/ 1024) {
    					after_end_slot.p(get_slot_context(after_end_slot_template, ctx, /*$$scope*/ ctx[103], get_after_end_slot_context_11), get_slot_changes(after_end_slot_template, /*$$scope*/ ctx[103], dirty, get_after_end_slot_changes_11));
    				}
    			}
    		},
    		i(local) {
    			if (current) return;
    			transition_in(after_start_slot, local);
    			transition_in(if_block1);
    			transition_in(after_slot, local);
    			transition_in(after_end_slot, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(after_start_slot, local);
    			transition_out(if_block1);
    			transition_out(after_slot, local);
    			transition_out(after_end_slot, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(div);
    			if (after_start_slot) after_start_slot.d(detaching);
    			if (if_block0) if_block0.d();
    			if (if_block1) if_block1.d();
    			if (after_slot) after_slot.d(detaching);
    			if (after_end_slot) after_end_slot.d(detaching);
    		}
    	};
    }

    // (1068:20) {#if typeof after !== 'undefined'}
    function create_if_block_122(ctx) {
    	let span;
    	let t_value = Utils.text(/*after*/ ctx[6]) + "";
    	let t;

    	return {
    		c() {
    			span = element("span");
    			t = text(t_value);
    		},
    		m(target, anchor) {
    			insert(target, span, anchor);
    			append(span, t);
    		},
    		p(ctx, dirty) {
    			if (dirty[0] & /*after*/ 64 && t_value !== (t_value = Utils.text(/*after*/ ctx[6]) + "")) set_data(t, t_value);
    		},
    		d(detaching) {
    			if (detaching) detach(span);
    		}
    	};
    }

    // (1071:20) {#if typeof badge !== 'undefined'}
    function create_if_block_121(ctx) {
    	let current;

    	const badge_1 = new Badge({
    			props: {
    				color: /*badgeColor*/ ctx[8],
    				$$slots: { default: [create_default_slot_11] },
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
    			if (dirty[0] & /*badgeColor*/ 256) badge_1_changes.color = /*badgeColor*/ ctx[8];

    			if (dirty[0] & /*badge*/ 128 | dirty[3] & /*$$scope*/ 1024) {
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

    // (1072:22) <Badge color={badgeColor}>
    function create_default_slot_11(ctx) {
    	let t_value = Utils.text(/*badge*/ ctx[7]) + "";
    	let t;

    	return {
    		c() {
    			t = text(t_value);
    		},
    		m(target, anchor) {
    			insert(target, t, anchor);
    		},
    		p(ctx, dirty) {
    			if (dirty[0] & /*badge*/ 128 && t_value !== (t_value = Utils.text(/*badge*/ ctx[7]) + "")) set_data(t, t_value);
    		},
    		d(detaching) {
    			if (detaching) detach(t);
    		}
    	};
    }

    // (1079:16) {#if !(swipeout || accordionItem)}
    function create_if_block_119(ctx) {
    	let current;
    	const default_slot_template = /*$$slots*/ ctx[89].default;
    	const default_slot = create_slot(default_slot_template, ctx, /*$$scope*/ ctx[103], null);

    	return {
    		c() {
    			if (default_slot) default_slot.c();
    		},
    		m(target, anchor) {
    			if (default_slot) {
    				default_slot.m(target, anchor);
    			}

    			current = true;
    		},
    		p(ctx, dirty) {
    			if (default_slot) {
    				if (default_slot.p && dirty[3] & /*$$scope*/ 1024) {
    					default_slot.p(get_slot_context(default_slot_template, ctx, /*$$scope*/ ctx[103], null), get_slot_changes(default_slot_template, /*$$scope*/ ctx[103], dirty, null));
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
    			if (default_slot) default_slot.d(detaching);
    		}
    	};
    }

    // (993:16) {#if hasHeader}
    function create_if_block_118(ctx) {
    	let div;
    	let t0_value = Utils.text(/*header*/ ctx[4]) + "";
    	let t0;
    	let t1;
    	let current;
    	const header_slot_template = /*$$slots*/ ctx[89].header;
    	const header_slot = create_slot(header_slot_template, ctx, /*$$scope*/ ctx[103], get_header_slot_context_10);

    	return {
    		c() {
    			div = element("div");
    			t0 = text(t0_value);
    			t1 = space();
    			if (header_slot) header_slot.c();
    			attr(div, "class", "item-header");
    		},
    		m(target, anchor) {
    			insert(target, div, anchor);
    			append(div, t0);
    			append(div, t1);

    			if (header_slot) {
    				header_slot.m(div, null);
    			}

    			current = true;
    		},
    		p(ctx, dirty) {
    			if ((!current || dirty[0] & /*header*/ 16) && t0_value !== (t0_value = Utils.text(/*header*/ ctx[4]) + "")) set_data(t0, t0_value);

    			if (header_slot) {
    				if (header_slot.p && dirty[3] & /*$$scope*/ 1024) {
    					header_slot.p(get_slot_context(header_slot_template, ctx, /*$$scope*/ ctx[103], get_header_slot_context_10), get_slot_changes(header_slot_template, /*$$scope*/ ctx[103], dirty, get_header_slot_changes_10));
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
    		}
    	};
    }

    // (1001:18) {#if (hasTitle)}
    function create_if_block_117(ctx) {
    	let div;
    	let t0_value = Utils.text(/*title*/ ctx[0]) + "";
    	let t0;
    	let t1;
    	let current;
    	const title_slot_template = /*$$slots*/ ctx[89].title;
    	const title_slot = create_slot(title_slot_template, ctx, /*$$scope*/ ctx[103], get_title_slot_context_10);

    	return {
    		c() {
    			div = element("div");
    			t0 = text(t0_value);
    			t1 = space();
    			if (title_slot) title_slot.c();
    			attr(div, "class", "item-title");
    		},
    		m(target, anchor) {
    			insert(target, div, anchor);
    			append(div, t0);
    			append(div, t1);

    			if (title_slot) {
    				title_slot.m(div, null);
    			}

    			current = true;
    		},
    		p(ctx, dirty) {
    			if ((!current || dirty[0] & /*title*/ 1) && t0_value !== (t0_value = Utils.text(/*title*/ ctx[0]) + "")) set_data(t0, t0_value);

    			if (title_slot) {
    				if (title_slot.p && dirty[3] & /*$$scope*/ 1024) {
    					title_slot.p(get_slot_context(title_slot_template, ctx, /*$$scope*/ ctx[103], get_title_slot_context_10), get_slot_changes(title_slot_template, /*$$scope*/ ctx[103], dirty, get_title_slot_changes_10));
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
    			if (detaching) detach(div);
    			if (title_slot) title_slot.d(detaching);
    		}
    	};
    }

    // (1008:18) {#if hasAfter}
    function create_if_block_114(ctx) {
    	let div;
    	let t0;
    	let t1;
    	let t2;
    	let t3;
    	let current;
    	const after_start_slot_template = /*$$slots*/ ctx[89]["after-start"];
    	const after_start_slot = create_slot(after_start_slot_template, ctx, /*$$scope*/ ctx[103], get_after_start_slot_context_10);
    	let if_block0 = typeof /*after*/ ctx[6] !== "undefined" && create_if_block_116(ctx);
    	let if_block1 = typeof /*badge*/ ctx[7] !== "undefined" && create_if_block_115(ctx);
    	const after_slot_template = /*$$slots*/ ctx[89].after;
    	const after_slot = create_slot(after_slot_template, ctx, /*$$scope*/ ctx[103], get_after_slot_context_10);
    	const after_end_slot_template = /*$$slots*/ ctx[89]["after-end"];
    	const after_end_slot = create_slot(after_end_slot_template, ctx, /*$$scope*/ ctx[103], get_after_end_slot_context_10);

    	return {
    		c() {
    			div = element("div");
    			if (after_start_slot) after_start_slot.c();
    			t0 = space();
    			if (if_block0) if_block0.c();
    			t1 = space();
    			if (if_block1) if_block1.c();
    			t2 = space();
    			if (after_slot) after_slot.c();
    			t3 = space();
    			if (after_end_slot) after_end_slot.c();
    			attr(div, "class", "item-after");
    		},
    		m(target, anchor) {
    			insert(target, div, anchor);

    			if (after_start_slot) {
    				after_start_slot.m(div, null);
    			}

    			append(div, t0);
    			if (if_block0) if_block0.m(div, null);
    			append(div, t1);
    			if (if_block1) if_block1.m(div, null);
    			append(div, t2);

    			if (after_slot) {
    				after_slot.m(div, null);
    			}

    			append(div, t3);

    			if (after_end_slot) {
    				after_end_slot.m(div, null);
    			}

    			current = true;
    		},
    		p(ctx, dirty) {
    			if (after_start_slot) {
    				if (after_start_slot.p && dirty[3] & /*$$scope*/ 1024) {
    					after_start_slot.p(get_slot_context(after_start_slot_template, ctx, /*$$scope*/ ctx[103], get_after_start_slot_context_10), get_slot_changes(after_start_slot_template, /*$$scope*/ ctx[103], dirty, get_after_start_slot_changes_10));
    				}
    			}

    			if (typeof /*after*/ ctx[6] !== "undefined") {
    				if (if_block0) {
    					if_block0.p(ctx, dirty);
    				} else {
    					if_block0 = create_if_block_116(ctx);
    					if_block0.c();
    					if_block0.m(div, t1);
    				}
    			} else if (if_block0) {
    				if_block0.d(1);
    				if_block0 = null;
    			}

    			if (typeof /*badge*/ ctx[7] !== "undefined") {
    				if (if_block1) {
    					if_block1.p(ctx, dirty);

    					if (dirty[0] & /*badge*/ 128) {
    						transition_in(if_block1, 1);
    					}
    				} else {
    					if_block1 = create_if_block_115(ctx);
    					if_block1.c();
    					transition_in(if_block1, 1);
    					if_block1.m(div, t2);
    				}
    			} else if (if_block1) {
    				group_outros();

    				transition_out(if_block1, 1, 1, () => {
    					if_block1 = null;
    				});

    				check_outros();
    			}

    			if (after_slot) {
    				if (after_slot.p && dirty[3] & /*$$scope*/ 1024) {
    					after_slot.p(get_slot_context(after_slot_template, ctx, /*$$scope*/ ctx[103], get_after_slot_context_10), get_slot_changes(after_slot_template, /*$$scope*/ ctx[103], dirty, get_after_slot_changes_10));
    				}
    			}

    			if (after_end_slot) {
    				if (after_end_slot.p && dirty[3] & /*$$scope*/ 1024) {
    					after_end_slot.p(get_slot_context(after_end_slot_template, ctx, /*$$scope*/ ctx[103], get_after_end_slot_context_10), get_slot_changes(after_end_slot_template, /*$$scope*/ ctx[103], dirty, get_after_end_slot_changes_10));
    				}
    			}
    		},
    		i(local) {
    			if (current) return;
    			transition_in(after_start_slot, local);
    			transition_in(if_block1);
    			transition_in(after_slot, local);
    			transition_in(after_end_slot, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(after_start_slot, local);
    			transition_out(if_block1);
    			transition_out(after_slot, local);
    			transition_out(after_end_slot, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(div);
    			if (after_start_slot) after_start_slot.d(detaching);
    			if (if_block0) if_block0.d();
    			if (if_block1) if_block1.d();
    			if (after_slot) after_slot.d(detaching);
    			if (after_end_slot) after_end_slot.d(detaching);
    		}
    	};
    }

    // (1011:22) {#if typeof after !== 'undefined'}
    function create_if_block_116(ctx) {
    	let span;
    	let t_value = Utils.text(/*after*/ ctx[6]) + "";
    	let t;

    	return {
    		c() {
    			span = element("span");
    			t = text(t_value);
    		},
    		m(target, anchor) {
    			insert(target, span, anchor);
    			append(span, t);
    		},
    		p(ctx, dirty) {
    			if (dirty[0] & /*after*/ 64 && t_value !== (t_value = Utils.text(/*after*/ ctx[6]) + "")) set_data(t, t_value);
    		},
    		d(detaching) {
    			if (detaching) detach(span);
    		}
    	};
    }

    // (1014:22) {#if typeof badge !== 'undefined'}
    function create_if_block_115(ctx) {
    	let current;

    	const badge_1 = new Badge({
    			props: {
    				color: /*badgeColor*/ ctx[8],
    				$$slots: { default: [create_default_slot_10] },
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
    			if (dirty[0] & /*badgeColor*/ 256) badge_1_changes.color = /*badgeColor*/ ctx[8];

    			if (dirty[0] & /*badge*/ 128 | dirty[3] & /*$$scope*/ 1024) {
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

    // (1015:24) <Badge color={badgeColor}>
    function create_default_slot_10(ctx) {
    	let t_value = Utils.text(/*badge*/ ctx[7]) + "";
    	let t;

    	return {
    		c() {
    			t = text(t_value);
    		},
    		m(target, anchor) {
    			insert(target, t, anchor);
    		},
    		p(ctx, dirty) {
    			if (dirty[0] & /*badge*/ 128 && t_value !== (t_value = Utils.text(/*badge*/ ctx[7]) + "")) set_data(t, t_value);
    		},
    		d(detaching) {
    			if (detaching) detach(t);
    		}
    	};
    }

    // (1022:16) {#if hasSubtitle}
    function create_if_block_113(ctx) {
    	let div;
    	let t0_value = Utils.text(/*subtitle*/ ctx[3]) + "";
    	let t0;
    	let t1;
    	let current;
    	const subtitle_slot_template = /*$$slots*/ ctx[89].subtitle;
    	const subtitle_slot = create_slot(subtitle_slot_template, ctx, /*$$scope*/ ctx[103], get_subtitle_slot_context_5);

    	return {
    		c() {
    			div = element("div");
    			t0 = text(t0_value);
    			t1 = space();
    			if (subtitle_slot) subtitle_slot.c();
    			attr(div, "class", "item-subtitle");
    		},
    		m(target, anchor) {
    			insert(target, div, anchor);
    			append(div, t0);
    			append(div, t1);

    			if (subtitle_slot) {
    				subtitle_slot.m(div, null);
    			}

    			current = true;
    		},
    		p(ctx, dirty) {
    			if ((!current || dirty[0] & /*subtitle*/ 8) && t0_value !== (t0_value = Utils.text(/*subtitle*/ ctx[3]) + "")) set_data(t0, t0_value);

    			if (subtitle_slot) {
    				if (subtitle_slot.p && dirty[3] & /*$$scope*/ 1024) {
    					subtitle_slot.p(get_slot_context(subtitle_slot_template, ctx, /*$$scope*/ ctx[103], get_subtitle_slot_context_5), get_slot_changes(subtitle_slot_template, /*$$scope*/ ctx[103], dirty, get_subtitle_slot_changes_5));
    				}
    			}
    		},
    		i(local) {
    			if (current) return;
    			transition_in(subtitle_slot, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(subtitle_slot, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(div);
    			if (subtitle_slot) subtitle_slot.d(detaching);
    		}
    	};
    }

    // (1028:16) {#if hasText}
    function create_if_block_112(ctx) {
    	let div;
    	let t0_value = Utils.text(/*text*/ ctx[1]) + "";
    	let t0;
    	let t1;
    	let current;
    	const text_slot_template = /*$$slots*/ ctx[89].text;
    	const text_slot = create_slot(text_slot_template, ctx, /*$$scope*/ ctx[103], get_text_slot_context_5);

    	return {
    		c() {
    			div = element("div");
    			t0 = text(t0_value);
    			t1 = space();
    			if (text_slot) text_slot.c();
    			attr(div, "class", "item-text");
    		},
    		m(target, anchor) {
    			insert(target, div, anchor);
    			append(div, t0);
    			append(div, t1);

    			if (text_slot) {
    				text_slot.m(div, null);
    			}

    			current = true;
    		},
    		p(ctx, dirty) {
    			if ((!current || dirty[0] & /*text*/ 2) && t0_value !== (t0_value = Utils.text(/*text*/ ctx[1]) + "")) set_data(t0, t0_value);

    			if (text_slot) {
    				if (text_slot.p && dirty[3] & /*$$scope*/ 1024) {
    					text_slot.p(get_slot_context(text_slot_template, ctx, /*$$scope*/ ctx[103], get_text_slot_context_5), get_slot_changes(text_slot_template, /*$$scope*/ ctx[103], dirty, get_text_slot_changes_5));
    				}
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
    			if (text_slot) text_slot.d(detaching);
    		}
    	};
    }

    // (1035:16) {#if !(swipeout || accordionItem)}
    function create_if_block_111(ctx) {
    	let current;
    	const default_slot_template = /*$$slots*/ ctx[89].default;
    	const default_slot = create_slot(default_slot_template, ctx, /*$$scope*/ ctx[103], null);

    	return {
    		c() {
    			if (default_slot) default_slot.c();
    		},
    		m(target, anchor) {
    			if (default_slot) {
    				default_slot.m(target, anchor);
    			}

    			current = true;
    		},
    		p(ctx, dirty) {
    			if (default_slot) {
    				if (default_slot.p && dirty[3] & /*$$scope*/ 1024) {
    					default_slot.p(get_slot_context(default_slot_template, ctx, /*$$scope*/ ctx[103], null), get_slot_changes(default_slot_template, /*$$scope*/ ctx[103], dirty, null));
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
    			if (default_slot) default_slot.d(detaching);
    		}
    	};
    }

    // (1038:16) {#if hasFooter}
    function create_if_block_110(ctx) {
    	let div;
    	let t0_value = Utils.text(/*footer*/ ctx[5]) + "";
    	let t0;
    	let t1;
    	let current;
    	const footer_slot_template = /*$$slots*/ ctx[89].footer;
    	const footer_slot = create_slot(footer_slot_template, ctx, /*$$scope*/ ctx[103], get_footer_slot_context_10);

    	return {
    		c() {
    			div = element("div");
    			t0 = text(t0_value);
    			t1 = space();
    			if (footer_slot) footer_slot.c();
    			attr(div, "class", "item-footer");
    		},
    		m(target, anchor) {
    			insert(target, div, anchor);
    			append(div, t0);
    			append(div, t1);

    			if (footer_slot) {
    				footer_slot.m(div, null);
    			}

    			current = true;
    		},
    		p(ctx, dirty) {
    			if ((!current || dirty[0] & /*footer*/ 32) && t0_value !== (t0_value = Utils.text(/*footer*/ ctx[5]) + "")) set_data(t0, t0_value);

    			if (footer_slot) {
    				if (footer_slot.p && dirty[3] & /*$$scope*/ 1024) {
    					footer_slot.p(get_slot_context(footer_slot_template, ctx, /*$$scope*/ ctx[103], get_footer_slot_context_10), get_slot_changes(footer_slot_template, /*$$scope*/ ctx[103], dirty, get_footer_slot_changes_10));
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
    		}
    	};
    }

    // (855:12) {#if isSortable && sortable !== false && isSortableOpposite}
    function create_if_block_108(ctx) {
    	let div;

    	return {
    		c() {
    			div = element("div");
    			attr(div, "class", "sortable-handler");
    		},
    		m(target, anchor) {
    			insert(target, div, anchor);
    		},
    		d(detaching) {
    			if (detaching) detach(div);
    		}
    	};
    }

    // (870:12) {#if hasMedia}
    function create_if_block_106(ctx) {
    	let div;
    	let t;
    	let current;
    	let if_block = typeof /*media*/ ctx[2] !== "undefined" && create_if_block_107(ctx);
    	const media_slot_template = /*$$slots*/ ctx[89].media;
    	const media_slot = create_slot(media_slot_template, ctx, /*$$scope*/ ctx[103], get_media_slot_context_4);

    	return {
    		c() {
    			div = element("div");
    			if (if_block) if_block.c();
    			t = space();
    			if (media_slot) media_slot.c();
    			attr(div, "class", "item-media");
    		},
    		m(target, anchor) {
    			insert(target, div, anchor);
    			if (if_block) if_block.m(div, null);
    			append(div, t);

    			if (media_slot) {
    				media_slot.m(div, null);
    			}

    			current = true;
    		},
    		p(ctx, dirty) {
    			if (typeof /*media*/ ctx[2] !== "undefined") {
    				if (if_block) {
    					if_block.p(ctx, dirty);
    				} else {
    					if_block = create_if_block_107(ctx);
    					if_block.c();
    					if_block.m(div, t);
    				}
    			} else if (if_block) {
    				if_block.d(1);
    				if_block = null;
    			}

    			if (media_slot) {
    				if (media_slot.p && dirty[3] & /*$$scope*/ 1024) {
    					media_slot.p(get_slot_context(media_slot_template, ctx, /*$$scope*/ ctx[103], get_media_slot_context_4), get_slot_changes(media_slot_template, /*$$scope*/ ctx[103], dirty, get_media_slot_changes_4));
    				}
    			}
    		},
    		i(local) {
    			if (current) return;
    			transition_in(media_slot, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(media_slot, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(div);
    			if (if_block) if_block.d();
    			if (media_slot) media_slot.d(detaching);
    		}
    	};
    }

    // (872:16) {#if typeof media !== 'undefined'}
    function create_if_block_107(ctx) {
    	let img;
    	let img_src_value;

    	return {
    		c() {
    			img = element("img");
    			if (img.src !== (img_src_value = /*media*/ ctx[2])) attr(img, "src", img_src_value);
    		},
    		m(target, anchor) {
    			insert(target, img, anchor);
    		},
    		p(ctx, dirty) {
    			if (dirty[0] & /*media*/ 4 && img.src !== (img_src_value = /*media*/ ctx[2])) {
    				attr(img, "src", img_src_value);
    			}
    		},
    		d(detaching) {
    			if (detaching) detach(img);
    		}
    	};
    }

    // (932:14) {:else}
    function create_else_block_8(ctx) {
    	let t0;
    	let t1;
    	let t2;
    	let t3;
    	let t4;
    	let if_block2_anchor;
    	let current;
    	const before_title_slot_template = /*$$slots*/ ctx[89]["before-title"];
    	const before_title_slot = create_slot(before_title_slot_template, ctx, /*$$scope*/ ctx[103], get_before_title_slot_context_9);
    	let if_block0 = (/*hasTitle*/ ctx[37] || /*hasHeader*/ ctx[38] || /*hasFooter*/ ctx[39]) && create_if_block_103(ctx);
    	const after_title_slot_template = /*$$slots*/ ctx[89]["after-title"];
    	const after_title_slot = create_slot(after_title_slot_template, ctx, /*$$scope*/ ctx[103], get_after_title_slot_context_9);
    	let if_block1 = /*hasAfter*/ ctx[42] && create_if_block_100(ctx);
    	const inner_slot_template = /*$$slots*/ ctx[89].inner;
    	const inner_slot = create_slot(inner_slot_template, ctx, /*$$scope*/ ctx[103], get_inner_slot_context_9);
    	let if_block2 = !(/*swipeout*/ ctx[11] || /*accordionItem*/ ctx[13]) && create_if_block_99(ctx);

    	return {
    		c() {
    			if (before_title_slot) before_title_slot.c();
    			t0 = space();
    			if (if_block0) if_block0.c();
    			t1 = space();
    			if (after_title_slot) after_title_slot.c();
    			t2 = space();
    			if (if_block1) if_block1.c();
    			t3 = space();
    			if (inner_slot) inner_slot.c();
    			t4 = space();
    			if (if_block2) if_block2.c();
    			if_block2_anchor = empty();
    		},
    		m(target, anchor) {
    			if (before_title_slot) {
    				before_title_slot.m(target, anchor);
    			}

    			insert(target, t0, anchor);
    			if (if_block0) if_block0.m(target, anchor);
    			insert(target, t1, anchor);

    			if (after_title_slot) {
    				after_title_slot.m(target, anchor);
    			}

    			insert(target, t2, anchor);
    			if (if_block1) if_block1.m(target, anchor);
    			insert(target, t3, anchor);

    			if (inner_slot) {
    				inner_slot.m(target, anchor);
    			}

    			insert(target, t4, anchor);
    			if (if_block2) if_block2.m(target, anchor);
    			insert(target, if_block2_anchor, anchor);
    			current = true;
    		},
    		p(ctx, dirty) {
    			if (before_title_slot) {
    				if (before_title_slot.p && dirty[3] & /*$$scope*/ 1024) {
    					before_title_slot.p(get_slot_context(before_title_slot_template, ctx, /*$$scope*/ ctx[103], get_before_title_slot_context_9), get_slot_changes(before_title_slot_template, /*$$scope*/ ctx[103], dirty, get_before_title_slot_changes_9));
    				}
    			}

    			if (/*hasTitle*/ ctx[37] || /*hasHeader*/ ctx[38] || /*hasFooter*/ ctx[39]) {
    				if (if_block0) {
    					if_block0.p(ctx, dirty);

    					if (dirty[1] & /*hasTitle, hasHeader, hasFooter*/ 448) {
    						transition_in(if_block0, 1);
    					}
    				} else {
    					if_block0 = create_if_block_103(ctx);
    					if_block0.c();
    					transition_in(if_block0, 1);
    					if_block0.m(t1.parentNode, t1);
    				}
    			} else if (if_block0) {
    				group_outros();

    				transition_out(if_block0, 1, 1, () => {
    					if_block0 = null;
    				});

    				check_outros();
    			}

    			if (after_title_slot) {
    				if (after_title_slot.p && dirty[3] & /*$$scope*/ 1024) {
    					after_title_slot.p(get_slot_context(after_title_slot_template, ctx, /*$$scope*/ ctx[103], get_after_title_slot_context_9), get_slot_changes(after_title_slot_template, /*$$scope*/ ctx[103], dirty, get_after_title_slot_changes_9));
    				}
    			}

    			if (/*hasAfter*/ ctx[42]) {
    				if (if_block1) {
    					if_block1.p(ctx, dirty);

    					if (dirty[1] & /*hasAfter*/ 2048) {
    						transition_in(if_block1, 1);
    					}
    				} else {
    					if_block1 = create_if_block_100(ctx);
    					if_block1.c();
    					transition_in(if_block1, 1);
    					if_block1.m(t3.parentNode, t3);
    				}
    			} else if (if_block1) {
    				group_outros();

    				transition_out(if_block1, 1, 1, () => {
    					if_block1 = null;
    				});

    				check_outros();
    			}

    			if (inner_slot) {
    				if (inner_slot.p && dirty[3] & /*$$scope*/ 1024) {
    					inner_slot.p(get_slot_context(inner_slot_template, ctx, /*$$scope*/ ctx[103], get_inner_slot_context_9), get_slot_changes(inner_slot_template, /*$$scope*/ ctx[103], dirty, get_inner_slot_changes_9));
    				}
    			}

    			if (!(/*swipeout*/ ctx[11] || /*accordionItem*/ ctx[13])) {
    				if (if_block2) {
    					if_block2.p(ctx, dirty);

    					if (dirty[0] & /*swipeout, accordionItem*/ 10240) {
    						transition_in(if_block2, 1);
    					}
    				} else {
    					if_block2 = create_if_block_99(ctx);
    					if_block2.c();
    					transition_in(if_block2, 1);
    					if_block2.m(if_block2_anchor.parentNode, if_block2_anchor);
    				}
    			} else if (if_block2) {
    				group_outros();

    				transition_out(if_block2, 1, 1, () => {
    					if_block2 = null;
    				});

    				check_outros();
    			}
    		},
    		i(local) {
    			if (current) return;
    			transition_in(before_title_slot, local);
    			transition_in(if_block0);
    			transition_in(after_title_slot, local);
    			transition_in(if_block1);
    			transition_in(inner_slot, local);
    			transition_in(if_block2);
    			current = true;
    		},
    		o(local) {
    			transition_out(before_title_slot, local);
    			transition_out(if_block0);
    			transition_out(after_title_slot, local);
    			transition_out(if_block1);
    			transition_out(inner_slot, local);
    			transition_out(if_block2);
    			current = false;
    		},
    		d(detaching) {
    			if (before_title_slot) before_title_slot.d(detaching);
    			if (detaching) detach(t0);
    			if (if_block0) if_block0.d(detaching);
    			if (detaching) detach(t1);
    			if (after_title_slot) after_title_slot.d(detaching);
    			if (detaching) detach(t2);
    			if (if_block1) if_block1.d(detaching);
    			if (detaching) detach(t3);
    			if (inner_slot) inner_slot.d(detaching);
    			if (detaching) detach(t4);
    			if (if_block2) if_block2.d(detaching);
    			if (detaching) detach(if_block2_anchor);
    		}
    	};
    }

    // (880:14) {#if isMedia}
    function create_if_block_89(ctx) {
    	let t0;
    	let div;
    	let t1;
    	let t2;
    	let t3;
    	let t4;
    	let t5;
    	let t6;
    	let t7;
    	let t8;
    	let if_block6_anchor;
    	let current;
    	let if_block0 = /*hasHeader*/ ctx[38] && create_if_block_98(ctx);
    	const before_title_slot_template = /*$$slots*/ ctx[89]["before-title"];
    	const before_title_slot = create_slot(before_title_slot_template, ctx, /*$$scope*/ ctx[103], get_before_title_slot_context_8);
    	let if_block1 = /*hasTitle*/ ctx[37] && create_if_block_97(ctx);
    	const after_title_slot_template = /*$$slots*/ ctx[89]["after-title"];
    	const after_title_slot = create_slot(after_title_slot_template, ctx, /*$$scope*/ ctx[103], get_after_title_slot_context_8);
    	let if_block2 = /*hasAfter*/ ctx[42] && create_if_block_94(ctx);
    	let if_block3 = /*hasSubtitle*/ ctx[40] && create_if_block_93(ctx);
    	let if_block4 = /*hasText*/ ctx[41] && create_if_block_92(ctx);
    	const inner_slot_template = /*$$slots*/ ctx[89].inner;
    	const inner_slot = create_slot(inner_slot_template, ctx, /*$$scope*/ ctx[103], get_inner_slot_context_8);
    	let if_block5 = !(/*swipeout*/ ctx[11] || /*accordionItem*/ ctx[13]) && create_if_block_91(ctx);
    	let if_block6 = /*hasFooter*/ ctx[39] && create_if_block_90(ctx);

    	return {
    		c() {
    			if (if_block0) if_block0.c();
    			t0 = space();
    			div = element("div");
    			if (before_title_slot) before_title_slot.c();
    			t1 = space();
    			if (if_block1) if_block1.c();
    			t2 = space();
    			if (after_title_slot) after_title_slot.c();
    			t3 = space();
    			if (if_block2) if_block2.c();
    			t4 = space();
    			if (if_block3) if_block3.c();
    			t5 = space();
    			if (if_block4) if_block4.c();
    			t6 = space();
    			if (inner_slot) inner_slot.c();
    			t7 = space();
    			if (if_block5) if_block5.c();
    			t8 = space();
    			if (if_block6) if_block6.c();
    			if_block6_anchor = empty();
    			attr(div, "class", "item-title-row");
    		},
    		m(target, anchor) {
    			if (if_block0) if_block0.m(target, anchor);
    			insert(target, t0, anchor);
    			insert(target, div, anchor);

    			if (before_title_slot) {
    				before_title_slot.m(div, null);
    			}

    			append(div, t1);
    			if (if_block1) if_block1.m(div, null);
    			append(div, t2);

    			if (after_title_slot) {
    				after_title_slot.m(div, null);
    			}

    			append(div, t3);
    			if (if_block2) if_block2.m(div, null);
    			insert(target, t4, anchor);
    			if (if_block3) if_block3.m(target, anchor);
    			insert(target, t5, anchor);
    			if (if_block4) if_block4.m(target, anchor);
    			insert(target, t6, anchor);

    			if (inner_slot) {
    				inner_slot.m(target, anchor);
    			}

    			insert(target, t7, anchor);
    			if (if_block5) if_block5.m(target, anchor);
    			insert(target, t8, anchor);
    			if (if_block6) if_block6.m(target, anchor);
    			insert(target, if_block6_anchor, anchor);
    			current = true;
    		},
    		p(ctx, dirty) {
    			if (/*hasHeader*/ ctx[38]) {
    				if (if_block0) {
    					if_block0.p(ctx, dirty);

    					if (dirty[1] & /*hasHeader*/ 128) {
    						transition_in(if_block0, 1);
    					}
    				} else {
    					if_block0 = create_if_block_98(ctx);
    					if_block0.c();
    					transition_in(if_block0, 1);
    					if_block0.m(t0.parentNode, t0);
    				}
    			} else if (if_block0) {
    				group_outros();

    				transition_out(if_block0, 1, 1, () => {
    					if_block0 = null;
    				});

    				check_outros();
    			}

    			if (before_title_slot) {
    				if (before_title_slot.p && dirty[3] & /*$$scope*/ 1024) {
    					before_title_slot.p(get_slot_context(before_title_slot_template, ctx, /*$$scope*/ ctx[103], get_before_title_slot_context_8), get_slot_changes(before_title_slot_template, /*$$scope*/ ctx[103], dirty, get_before_title_slot_changes_8));
    				}
    			}

    			if (/*hasTitle*/ ctx[37]) {
    				if (if_block1) {
    					if_block1.p(ctx, dirty);

    					if (dirty[1] & /*hasTitle*/ 64) {
    						transition_in(if_block1, 1);
    					}
    				} else {
    					if_block1 = create_if_block_97(ctx);
    					if_block1.c();
    					transition_in(if_block1, 1);
    					if_block1.m(div, t2);
    				}
    			} else if (if_block1) {
    				group_outros();

    				transition_out(if_block1, 1, 1, () => {
    					if_block1 = null;
    				});

    				check_outros();
    			}

    			if (after_title_slot) {
    				if (after_title_slot.p && dirty[3] & /*$$scope*/ 1024) {
    					after_title_slot.p(get_slot_context(after_title_slot_template, ctx, /*$$scope*/ ctx[103], get_after_title_slot_context_8), get_slot_changes(after_title_slot_template, /*$$scope*/ ctx[103], dirty, get_after_title_slot_changes_8));
    				}
    			}

    			if (/*hasAfter*/ ctx[42]) {
    				if (if_block2) {
    					if_block2.p(ctx, dirty);

    					if (dirty[1] & /*hasAfter*/ 2048) {
    						transition_in(if_block2, 1);
    					}
    				} else {
    					if_block2 = create_if_block_94(ctx);
    					if_block2.c();
    					transition_in(if_block2, 1);
    					if_block2.m(div, null);
    				}
    			} else if (if_block2) {
    				group_outros();

    				transition_out(if_block2, 1, 1, () => {
    					if_block2 = null;
    				});

    				check_outros();
    			}

    			if (/*hasSubtitle*/ ctx[40]) {
    				if (if_block3) {
    					if_block3.p(ctx, dirty);

    					if (dirty[1] & /*hasSubtitle*/ 512) {
    						transition_in(if_block3, 1);
    					}
    				} else {
    					if_block3 = create_if_block_93(ctx);
    					if_block3.c();
    					transition_in(if_block3, 1);
    					if_block3.m(t5.parentNode, t5);
    				}
    			} else if (if_block3) {
    				group_outros();

    				transition_out(if_block3, 1, 1, () => {
    					if_block3 = null;
    				});

    				check_outros();
    			}

    			if (/*hasText*/ ctx[41]) {
    				if (if_block4) {
    					if_block4.p(ctx, dirty);

    					if (dirty[1] & /*hasText*/ 1024) {
    						transition_in(if_block4, 1);
    					}
    				} else {
    					if_block4 = create_if_block_92(ctx);
    					if_block4.c();
    					transition_in(if_block4, 1);
    					if_block4.m(t6.parentNode, t6);
    				}
    			} else if (if_block4) {
    				group_outros();

    				transition_out(if_block4, 1, 1, () => {
    					if_block4 = null;
    				});

    				check_outros();
    			}

    			if (inner_slot) {
    				if (inner_slot.p && dirty[3] & /*$$scope*/ 1024) {
    					inner_slot.p(get_slot_context(inner_slot_template, ctx, /*$$scope*/ ctx[103], get_inner_slot_context_8), get_slot_changes(inner_slot_template, /*$$scope*/ ctx[103], dirty, get_inner_slot_changes_8));
    				}
    			}

    			if (!(/*swipeout*/ ctx[11] || /*accordionItem*/ ctx[13])) {
    				if (if_block5) {
    					if_block5.p(ctx, dirty);

    					if (dirty[0] & /*swipeout, accordionItem*/ 10240) {
    						transition_in(if_block5, 1);
    					}
    				} else {
    					if_block5 = create_if_block_91(ctx);
    					if_block5.c();
    					transition_in(if_block5, 1);
    					if_block5.m(t8.parentNode, t8);
    				}
    			} else if (if_block5) {
    				group_outros();

    				transition_out(if_block5, 1, 1, () => {
    					if_block5 = null;
    				});

    				check_outros();
    			}

    			if (/*hasFooter*/ ctx[39]) {
    				if (if_block6) {
    					if_block6.p(ctx, dirty);

    					if (dirty[1] & /*hasFooter*/ 256) {
    						transition_in(if_block6, 1);
    					}
    				} else {
    					if_block6 = create_if_block_90(ctx);
    					if_block6.c();
    					transition_in(if_block6, 1);
    					if_block6.m(if_block6_anchor.parentNode, if_block6_anchor);
    				}
    			} else if (if_block6) {
    				group_outros();

    				transition_out(if_block6, 1, 1, () => {
    					if_block6 = null;
    				});

    				check_outros();
    			}
    		},
    		i(local) {
    			if (current) return;
    			transition_in(if_block0);
    			transition_in(before_title_slot, local);
    			transition_in(if_block1);
    			transition_in(after_title_slot, local);
    			transition_in(if_block2);
    			transition_in(if_block3);
    			transition_in(if_block4);
    			transition_in(inner_slot, local);
    			transition_in(if_block5);
    			transition_in(if_block6);
    			current = true;
    		},
    		o(local) {
    			transition_out(if_block0);
    			transition_out(before_title_slot, local);
    			transition_out(if_block1);
    			transition_out(after_title_slot, local);
    			transition_out(if_block2);
    			transition_out(if_block3);
    			transition_out(if_block4);
    			transition_out(inner_slot, local);
    			transition_out(if_block5);
    			transition_out(if_block6);
    			current = false;
    		},
    		d(detaching) {
    			if (if_block0) if_block0.d(detaching);
    			if (detaching) detach(t0);
    			if (detaching) detach(div);
    			if (before_title_slot) before_title_slot.d(detaching);
    			if (if_block1) if_block1.d();
    			if (after_title_slot) after_title_slot.d(detaching);
    			if (if_block2) if_block2.d();
    			if (detaching) detach(t4);
    			if (if_block3) if_block3.d(detaching);
    			if (detaching) detach(t5);
    			if (if_block4) if_block4.d(detaching);
    			if (detaching) detach(t6);
    			if (inner_slot) inner_slot.d(detaching);
    			if (detaching) detach(t7);
    			if (if_block5) if_block5.d(detaching);
    			if (detaching) detach(t8);
    			if (if_block6) if_block6.d(detaching);
    			if (detaching) detach(if_block6_anchor);
    		}
    	};
    }

    // (934:16) {#if (hasTitle || hasHeader || hasFooter)}
    function create_if_block_103(ctx) {
    	let div;
    	let t0;
    	let t1_value = Utils.text(/*title*/ ctx[0]) + "";
    	let t1;
    	let t2;
    	let t3;
    	let current;
    	let if_block0 = /*hasHeader*/ ctx[38] && create_if_block_105(ctx);
    	const title_slot_template = /*$$slots*/ ctx[89].title;
    	const title_slot = create_slot(title_slot_template, ctx, /*$$scope*/ ctx[103], get_title_slot_context_9);
    	let if_block1 = /*hasFooter*/ ctx[39] && create_if_block_104(ctx);

    	return {
    		c() {
    			div = element("div");
    			if (if_block0) if_block0.c();
    			t0 = space();
    			t1 = text(t1_value);
    			t2 = space();
    			if (title_slot) title_slot.c();
    			t3 = space();
    			if (if_block1) if_block1.c();
    			attr(div, "class", "item-title");
    		},
    		m(target, anchor) {
    			insert(target, div, anchor);
    			if (if_block0) if_block0.m(div, null);
    			append(div, t0);
    			append(div, t1);
    			append(div, t2);

    			if (title_slot) {
    				title_slot.m(div, null);
    			}

    			append(div, t3);
    			if (if_block1) if_block1.m(div, null);
    			current = true;
    		},
    		p(ctx, dirty) {
    			if (/*hasHeader*/ ctx[38]) {
    				if (if_block0) {
    					if_block0.p(ctx, dirty);

    					if (dirty[1] & /*hasHeader*/ 128) {
    						transition_in(if_block0, 1);
    					}
    				} else {
    					if_block0 = create_if_block_105(ctx);
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

    			if ((!current || dirty[0] & /*title*/ 1) && t1_value !== (t1_value = Utils.text(/*title*/ ctx[0]) + "")) set_data(t1, t1_value);

    			if (title_slot) {
    				if (title_slot.p && dirty[3] & /*$$scope*/ 1024) {
    					title_slot.p(get_slot_context(title_slot_template, ctx, /*$$scope*/ ctx[103], get_title_slot_context_9), get_slot_changes(title_slot_template, /*$$scope*/ ctx[103], dirty, get_title_slot_changes_9));
    				}
    			}

    			if (/*hasFooter*/ ctx[39]) {
    				if (if_block1) {
    					if_block1.p(ctx, dirty);

    					if (dirty[1] & /*hasFooter*/ 256) {
    						transition_in(if_block1, 1);
    					}
    				} else {
    					if_block1 = create_if_block_104(ctx);
    					if_block1.c();
    					transition_in(if_block1, 1);
    					if_block1.m(div, null);
    				}
    			} else if (if_block1) {
    				group_outros();

    				transition_out(if_block1, 1, 1, () => {
    					if_block1 = null;
    				});

    				check_outros();
    			}
    		},
    		i(local) {
    			if (current) return;
    			transition_in(if_block0);
    			transition_in(title_slot, local);
    			transition_in(if_block1);
    			current = true;
    		},
    		o(local) {
    			transition_out(if_block0);
    			transition_out(title_slot, local);
    			transition_out(if_block1);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(div);
    			if (if_block0) if_block0.d();
    			if (title_slot) title_slot.d(detaching);
    			if (if_block1) if_block1.d();
    		}
    	};
    }

    // (936:20) {#if hasHeader}
    function create_if_block_105(ctx) {
    	let div;
    	let t0_value = Utils.text(/*header*/ ctx[4]) + "";
    	let t0;
    	let t1;
    	let current;
    	const header_slot_template = /*$$slots*/ ctx[89].header;
    	const header_slot = create_slot(header_slot_template, ctx, /*$$scope*/ ctx[103], get_header_slot_context_9);

    	return {
    		c() {
    			div = element("div");
    			t0 = text(t0_value);
    			t1 = space();
    			if (header_slot) header_slot.c();
    			attr(div, "class", "item-header");
    		},
    		m(target, anchor) {
    			insert(target, div, anchor);
    			append(div, t0);
    			append(div, t1);

    			if (header_slot) {
    				header_slot.m(div, null);
    			}

    			current = true;
    		},
    		p(ctx, dirty) {
    			if ((!current || dirty[0] & /*header*/ 16) && t0_value !== (t0_value = Utils.text(/*header*/ ctx[4]) + "")) set_data(t0, t0_value);

    			if (header_slot) {
    				if (header_slot.p && dirty[3] & /*$$scope*/ 1024) {
    					header_slot.p(get_slot_context(header_slot_template, ctx, /*$$scope*/ ctx[103], get_header_slot_context_9), get_slot_changes(header_slot_template, /*$$scope*/ ctx[103], dirty, get_header_slot_changes_9));
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
    		}
    	};
    }

    // (944:20) {#if hasFooter}
    function create_if_block_104(ctx) {
    	let div;
    	let t0_value = Utils.text(/*footer*/ ctx[5]) + "";
    	let t0;
    	let t1;
    	let current;
    	const footer_slot_template = /*$$slots*/ ctx[89].footer;
    	const footer_slot = create_slot(footer_slot_template, ctx, /*$$scope*/ ctx[103], get_footer_slot_context_9);

    	return {
    		c() {
    			div = element("div");
    			t0 = text(t0_value);
    			t1 = space();
    			if (footer_slot) footer_slot.c();
    			attr(div, "class", "item-footer");
    		},
    		m(target, anchor) {
    			insert(target, div, anchor);
    			append(div, t0);
    			append(div, t1);

    			if (footer_slot) {
    				footer_slot.m(div, null);
    			}

    			current = true;
    		},
    		p(ctx, dirty) {
    			if ((!current || dirty[0] & /*footer*/ 32) && t0_value !== (t0_value = Utils.text(/*footer*/ ctx[5]) + "")) set_data(t0, t0_value);

    			if (footer_slot) {
    				if (footer_slot.p && dirty[3] & /*$$scope*/ 1024) {
    					footer_slot.p(get_slot_context(footer_slot_template, ctx, /*$$scope*/ ctx[103], get_footer_slot_context_9), get_slot_changes(footer_slot_template, /*$$scope*/ ctx[103], dirty, get_footer_slot_changes_9));
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
    		}
    	};
    }

    // (953:16) {#if hasAfter}
    function create_if_block_100(ctx) {
    	let div;
    	let t0;
    	let t1;
    	let t2;
    	let t3;
    	let current;
    	const after_start_slot_template = /*$$slots*/ ctx[89]["after-start"];
    	const after_start_slot = create_slot(after_start_slot_template, ctx, /*$$scope*/ ctx[103], get_after_start_slot_context_9);
    	let if_block0 = typeof /*after*/ ctx[6] !== "undefined" && create_if_block_102(ctx);
    	let if_block1 = typeof /*badge*/ ctx[7] !== "undefined" && create_if_block_101(ctx);
    	const after_slot_template = /*$$slots*/ ctx[89].after;
    	const after_slot = create_slot(after_slot_template, ctx, /*$$scope*/ ctx[103], get_after_slot_context_9);
    	const after_end_slot_template = /*$$slots*/ ctx[89]["after-end"];
    	const after_end_slot = create_slot(after_end_slot_template, ctx, /*$$scope*/ ctx[103], get_after_end_slot_context_9);

    	return {
    		c() {
    			div = element("div");
    			if (after_start_slot) after_start_slot.c();
    			t0 = space();
    			if (if_block0) if_block0.c();
    			t1 = space();
    			if (if_block1) if_block1.c();
    			t2 = space();
    			if (after_slot) after_slot.c();
    			t3 = space();
    			if (after_end_slot) after_end_slot.c();
    			attr(div, "class", "item-after");
    		},
    		m(target, anchor) {
    			insert(target, div, anchor);

    			if (after_start_slot) {
    				after_start_slot.m(div, null);
    			}

    			append(div, t0);
    			if (if_block0) if_block0.m(div, null);
    			append(div, t1);
    			if (if_block1) if_block1.m(div, null);
    			append(div, t2);

    			if (after_slot) {
    				after_slot.m(div, null);
    			}

    			append(div, t3);

    			if (after_end_slot) {
    				after_end_slot.m(div, null);
    			}

    			current = true;
    		},
    		p(ctx, dirty) {
    			if (after_start_slot) {
    				if (after_start_slot.p && dirty[3] & /*$$scope*/ 1024) {
    					after_start_slot.p(get_slot_context(after_start_slot_template, ctx, /*$$scope*/ ctx[103], get_after_start_slot_context_9), get_slot_changes(after_start_slot_template, /*$$scope*/ ctx[103], dirty, get_after_start_slot_changes_9));
    				}
    			}

    			if (typeof /*after*/ ctx[6] !== "undefined") {
    				if (if_block0) {
    					if_block0.p(ctx, dirty);
    				} else {
    					if_block0 = create_if_block_102(ctx);
    					if_block0.c();
    					if_block0.m(div, t1);
    				}
    			} else if (if_block0) {
    				if_block0.d(1);
    				if_block0 = null;
    			}

    			if (typeof /*badge*/ ctx[7] !== "undefined") {
    				if (if_block1) {
    					if_block1.p(ctx, dirty);

    					if (dirty[0] & /*badge*/ 128) {
    						transition_in(if_block1, 1);
    					}
    				} else {
    					if_block1 = create_if_block_101(ctx);
    					if_block1.c();
    					transition_in(if_block1, 1);
    					if_block1.m(div, t2);
    				}
    			} else if (if_block1) {
    				group_outros();

    				transition_out(if_block1, 1, 1, () => {
    					if_block1 = null;
    				});

    				check_outros();
    			}

    			if (after_slot) {
    				if (after_slot.p && dirty[3] & /*$$scope*/ 1024) {
    					after_slot.p(get_slot_context(after_slot_template, ctx, /*$$scope*/ ctx[103], get_after_slot_context_9), get_slot_changes(after_slot_template, /*$$scope*/ ctx[103], dirty, get_after_slot_changes_9));
    				}
    			}

    			if (after_end_slot) {
    				if (after_end_slot.p && dirty[3] & /*$$scope*/ 1024) {
    					after_end_slot.p(get_slot_context(after_end_slot_template, ctx, /*$$scope*/ ctx[103], get_after_end_slot_context_9), get_slot_changes(after_end_slot_template, /*$$scope*/ ctx[103], dirty, get_after_end_slot_changes_9));
    				}
    			}
    		},
    		i(local) {
    			if (current) return;
    			transition_in(after_start_slot, local);
    			transition_in(if_block1);
    			transition_in(after_slot, local);
    			transition_in(after_end_slot, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(after_start_slot, local);
    			transition_out(if_block1);
    			transition_out(after_slot, local);
    			transition_out(after_end_slot, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(div);
    			if (after_start_slot) after_start_slot.d(detaching);
    			if (if_block0) if_block0.d();
    			if (if_block1) if_block1.d();
    			if (after_slot) after_slot.d(detaching);
    			if (after_end_slot) after_end_slot.d(detaching);
    		}
    	};
    }

    // (956:20) {#if typeof after !== 'undefined'}
    function create_if_block_102(ctx) {
    	let span;
    	let t_value = Utils.text(/*after*/ ctx[6]) + "";
    	let t;

    	return {
    		c() {
    			span = element("span");
    			t = text(t_value);
    		},
    		m(target, anchor) {
    			insert(target, span, anchor);
    			append(span, t);
    		},
    		p(ctx, dirty) {
    			if (dirty[0] & /*after*/ 64 && t_value !== (t_value = Utils.text(/*after*/ ctx[6]) + "")) set_data(t, t_value);
    		},
    		d(detaching) {
    			if (detaching) detach(span);
    		}
    	};
    }

    // (959:20) {#if typeof badge !== 'undefined'}
    function create_if_block_101(ctx) {
    	let current;

    	const badge_1 = new Badge({
    			props: {
    				color: /*badgeColor*/ ctx[8],
    				$$slots: { default: [create_default_slot_9] },
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
    			if (dirty[0] & /*badgeColor*/ 256) badge_1_changes.color = /*badgeColor*/ ctx[8];

    			if (dirty[0] & /*badge*/ 128 | dirty[3] & /*$$scope*/ 1024) {
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

    // (960:22) <Badge color={badgeColor}>
    function create_default_slot_9(ctx) {
    	let t_value = Utils.text(/*badge*/ ctx[7]) + "";
    	let t;

    	return {
    		c() {
    			t = text(t_value);
    		},
    		m(target, anchor) {
    			insert(target, t, anchor);
    		},
    		p(ctx, dirty) {
    			if (dirty[0] & /*badge*/ 128 && t_value !== (t_value = Utils.text(/*badge*/ ctx[7]) + "")) set_data(t, t_value);
    		},
    		d(detaching) {
    			if (detaching) detach(t);
    		}
    	};
    }

    // (967:16) {#if !(swipeout || accordionItem)}
    function create_if_block_99(ctx) {
    	let current;
    	const default_slot_template = /*$$slots*/ ctx[89].default;
    	const default_slot = create_slot(default_slot_template, ctx, /*$$scope*/ ctx[103], null);

    	return {
    		c() {
    			if (default_slot) default_slot.c();
    		},
    		m(target, anchor) {
    			if (default_slot) {
    				default_slot.m(target, anchor);
    			}

    			current = true;
    		},
    		p(ctx, dirty) {
    			if (default_slot) {
    				if (default_slot.p && dirty[3] & /*$$scope*/ 1024) {
    					default_slot.p(get_slot_context(default_slot_template, ctx, /*$$scope*/ ctx[103], null), get_slot_changes(default_slot_template, /*$$scope*/ ctx[103], dirty, null));
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
    			if (default_slot) default_slot.d(detaching);
    		}
    	};
    }

    // (881:16) {#if hasHeader}
    function create_if_block_98(ctx) {
    	let div;
    	let t0_value = Utils.text(/*header*/ ctx[4]) + "";
    	let t0;
    	let t1;
    	let current;
    	const header_slot_template = /*$$slots*/ ctx[89].header;
    	const header_slot = create_slot(header_slot_template, ctx, /*$$scope*/ ctx[103], get_header_slot_context_8);

    	return {
    		c() {
    			div = element("div");
    			t0 = text(t0_value);
    			t1 = space();
    			if (header_slot) header_slot.c();
    			attr(div, "class", "item-header");
    		},
    		m(target, anchor) {
    			insert(target, div, anchor);
    			append(div, t0);
    			append(div, t1);

    			if (header_slot) {
    				header_slot.m(div, null);
    			}

    			current = true;
    		},
    		p(ctx, dirty) {
    			if ((!current || dirty[0] & /*header*/ 16) && t0_value !== (t0_value = Utils.text(/*header*/ ctx[4]) + "")) set_data(t0, t0_value);

    			if (header_slot) {
    				if (header_slot.p && dirty[3] & /*$$scope*/ 1024) {
    					header_slot.p(get_slot_context(header_slot_template, ctx, /*$$scope*/ ctx[103], get_header_slot_context_8), get_slot_changes(header_slot_template, /*$$scope*/ ctx[103], dirty, get_header_slot_changes_8));
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
    		}
    	};
    }

    // (889:18) {#if (hasTitle)}
    function create_if_block_97(ctx) {
    	let div;
    	let t0_value = Utils.text(/*title*/ ctx[0]) + "";
    	let t0;
    	let t1;
    	let current;
    	const title_slot_template = /*$$slots*/ ctx[89].title;
    	const title_slot = create_slot(title_slot_template, ctx, /*$$scope*/ ctx[103], get_title_slot_context_8);

    	return {
    		c() {
    			div = element("div");
    			t0 = text(t0_value);
    			t1 = space();
    			if (title_slot) title_slot.c();
    			attr(div, "class", "item-title");
    		},
    		m(target, anchor) {
    			insert(target, div, anchor);
    			append(div, t0);
    			append(div, t1);

    			if (title_slot) {
    				title_slot.m(div, null);
    			}

    			current = true;
    		},
    		p(ctx, dirty) {
    			if ((!current || dirty[0] & /*title*/ 1) && t0_value !== (t0_value = Utils.text(/*title*/ ctx[0]) + "")) set_data(t0, t0_value);

    			if (title_slot) {
    				if (title_slot.p && dirty[3] & /*$$scope*/ 1024) {
    					title_slot.p(get_slot_context(title_slot_template, ctx, /*$$scope*/ ctx[103], get_title_slot_context_8), get_slot_changes(title_slot_template, /*$$scope*/ ctx[103], dirty, get_title_slot_changes_8));
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
    			if (detaching) detach(div);
    			if (title_slot) title_slot.d(detaching);
    		}
    	};
    }

    // (896:18) {#if hasAfter}
    function create_if_block_94(ctx) {
    	let div;
    	let t0;
    	let t1;
    	let t2;
    	let t3;
    	let current;
    	const after_start_slot_template = /*$$slots*/ ctx[89]["after-start"];
    	const after_start_slot = create_slot(after_start_slot_template, ctx, /*$$scope*/ ctx[103], get_after_start_slot_context_8);
    	let if_block0 = typeof /*after*/ ctx[6] !== "undefined" && create_if_block_96(ctx);
    	let if_block1 = typeof /*badge*/ ctx[7] !== "undefined" && create_if_block_95(ctx);
    	const after_slot_template = /*$$slots*/ ctx[89].after;
    	const after_slot = create_slot(after_slot_template, ctx, /*$$scope*/ ctx[103], get_after_slot_context_8);
    	const after_end_slot_template = /*$$slots*/ ctx[89]["after-end"];
    	const after_end_slot = create_slot(after_end_slot_template, ctx, /*$$scope*/ ctx[103], get_after_end_slot_context_8);

    	return {
    		c() {
    			div = element("div");
    			if (after_start_slot) after_start_slot.c();
    			t0 = space();
    			if (if_block0) if_block0.c();
    			t1 = space();
    			if (if_block1) if_block1.c();
    			t2 = space();
    			if (after_slot) after_slot.c();
    			t3 = space();
    			if (after_end_slot) after_end_slot.c();
    			attr(div, "class", "item-after");
    		},
    		m(target, anchor) {
    			insert(target, div, anchor);

    			if (after_start_slot) {
    				after_start_slot.m(div, null);
    			}

    			append(div, t0);
    			if (if_block0) if_block0.m(div, null);
    			append(div, t1);
    			if (if_block1) if_block1.m(div, null);
    			append(div, t2);

    			if (after_slot) {
    				after_slot.m(div, null);
    			}

    			append(div, t3);

    			if (after_end_slot) {
    				after_end_slot.m(div, null);
    			}

    			current = true;
    		},
    		p(ctx, dirty) {
    			if (after_start_slot) {
    				if (after_start_slot.p && dirty[3] & /*$$scope*/ 1024) {
    					after_start_slot.p(get_slot_context(after_start_slot_template, ctx, /*$$scope*/ ctx[103], get_after_start_slot_context_8), get_slot_changes(after_start_slot_template, /*$$scope*/ ctx[103], dirty, get_after_start_slot_changes_8));
    				}
    			}

    			if (typeof /*after*/ ctx[6] !== "undefined") {
    				if (if_block0) {
    					if_block0.p(ctx, dirty);
    				} else {
    					if_block0 = create_if_block_96(ctx);
    					if_block0.c();
    					if_block0.m(div, t1);
    				}
    			} else if (if_block0) {
    				if_block0.d(1);
    				if_block0 = null;
    			}

    			if (typeof /*badge*/ ctx[7] !== "undefined") {
    				if (if_block1) {
    					if_block1.p(ctx, dirty);

    					if (dirty[0] & /*badge*/ 128) {
    						transition_in(if_block1, 1);
    					}
    				} else {
    					if_block1 = create_if_block_95(ctx);
    					if_block1.c();
    					transition_in(if_block1, 1);
    					if_block1.m(div, t2);
    				}
    			} else if (if_block1) {
    				group_outros();

    				transition_out(if_block1, 1, 1, () => {
    					if_block1 = null;
    				});

    				check_outros();
    			}

    			if (after_slot) {
    				if (after_slot.p && dirty[3] & /*$$scope*/ 1024) {
    					after_slot.p(get_slot_context(after_slot_template, ctx, /*$$scope*/ ctx[103], get_after_slot_context_8), get_slot_changes(after_slot_template, /*$$scope*/ ctx[103], dirty, get_after_slot_changes_8));
    				}
    			}

    			if (after_end_slot) {
    				if (after_end_slot.p && dirty[3] & /*$$scope*/ 1024) {
    					after_end_slot.p(get_slot_context(after_end_slot_template, ctx, /*$$scope*/ ctx[103], get_after_end_slot_context_8), get_slot_changes(after_end_slot_template, /*$$scope*/ ctx[103], dirty, get_after_end_slot_changes_8));
    				}
    			}
    		},
    		i(local) {
    			if (current) return;
    			transition_in(after_start_slot, local);
    			transition_in(if_block1);
    			transition_in(after_slot, local);
    			transition_in(after_end_slot, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(after_start_slot, local);
    			transition_out(if_block1);
    			transition_out(after_slot, local);
    			transition_out(after_end_slot, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(div);
    			if (after_start_slot) after_start_slot.d(detaching);
    			if (if_block0) if_block0.d();
    			if (if_block1) if_block1.d();
    			if (after_slot) after_slot.d(detaching);
    			if (after_end_slot) after_end_slot.d(detaching);
    		}
    	};
    }

    // (899:22) {#if typeof after !== 'undefined'}
    function create_if_block_96(ctx) {
    	let span;
    	let t_value = Utils.text(/*after*/ ctx[6]) + "";
    	let t;

    	return {
    		c() {
    			span = element("span");
    			t = text(t_value);
    		},
    		m(target, anchor) {
    			insert(target, span, anchor);
    			append(span, t);
    		},
    		p(ctx, dirty) {
    			if (dirty[0] & /*after*/ 64 && t_value !== (t_value = Utils.text(/*after*/ ctx[6]) + "")) set_data(t, t_value);
    		},
    		d(detaching) {
    			if (detaching) detach(span);
    		}
    	};
    }

    // (902:22) {#if typeof badge !== 'undefined'}
    function create_if_block_95(ctx) {
    	let current;

    	const badge_1 = new Badge({
    			props: {
    				color: /*badgeColor*/ ctx[8],
    				$$slots: { default: [create_default_slot_8] },
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
    			if (dirty[0] & /*badgeColor*/ 256) badge_1_changes.color = /*badgeColor*/ ctx[8];

    			if (dirty[0] & /*badge*/ 128 | dirty[3] & /*$$scope*/ 1024) {
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

    // (903:24) <Badge color={badgeColor}>
    function create_default_slot_8(ctx) {
    	let t_value = Utils.text(/*badge*/ ctx[7]) + "";
    	let t;

    	return {
    		c() {
    			t = text(t_value);
    		},
    		m(target, anchor) {
    			insert(target, t, anchor);
    		},
    		p(ctx, dirty) {
    			if (dirty[0] & /*badge*/ 128 && t_value !== (t_value = Utils.text(/*badge*/ ctx[7]) + "")) set_data(t, t_value);
    		},
    		d(detaching) {
    			if (detaching) detach(t);
    		}
    	};
    }

    // (910:16) {#if hasSubtitle}
    function create_if_block_93(ctx) {
    	let div;
    	let t0_value = Utils.text(/*subtitle*/ ctx[3]) + "";
    	let t0;
    	let t1;
    	let current;
    	const subtitle_slot_template = /*$$slots*/ ctx[89].subtitle;
    	const subtitle_slot = create_slot(subtitle_slot_template, ctx, /*$$scope*/ ctx[103], get_subtitle_slot_context_4);

    	return {
    		c() {
    			div = element("div");
    			t0 = text(t0_value);
    			t1 = space();
    			if (subtitle_slot) subtitle_slot.c();
    			attr(div, "class", "item-subtitle");
    		},
    		m(target, anchor) {
    			insert(target, div, anchor);
    			append(div, t0);
    			append(div, t1);

    			if (subtitle_slot) {
    				subtitle_slot.m(div, null);
    			}

    			current = true;
    		},
    		p(ctx, dirty) {
    			if ((!current || dirty[0] & /*subtitle*/ 8) && t0_value !== (t0_value = Utils.text(/*subtitle*/ ctx[3]) + "")) set_data(t0, t0_value);

    			if (subtitle_slot) {
    				if (subtitle_slot.p && dirty[3] & /*$$scope*/ 1024) {
    					subtitle_slot.p(get_slot_context(subtitle_slot_template, ctx, /*$$scope*/ ctx[103], get_subtitle_slot_context_4), get_slot_changes(subtitle_slot_template, /*$$scope*/ ctx[103], dirty, get_subtitle_slot_changes_4));
    				}
    			}
    		},
    		i(local) {
    			if (current) return;
    			transition_in(subtitle_slot, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(subtitle_slot, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(div);
    			if (subtitle_slot) subtitle_slot.d(detaching);
    		}
    	};
    }

    // (916:16) {#if hasText}
    function create_if_block_92(ctx) {
    	let div;
    	let t0_value = Utils.text(/*text*/ ctx[1]) + "";
    	let t0;
    	let t1;
    	let current;
    	const text_slot_template = /*$$slots*/ ctx[89].text;
    	const text_slot = create_slot(text_slot_template, ctx, /*$$scope*/ ctx[103], get_text_slot_context_4);

    	return {
    		c() {
    			div = element("div");
    			t0 = text(t0_value);
    			t1 = space();
    			if (text_slot) text_slot.c();
    			attr(div, "class", "item-text");
    		},
    		m(target, anchor) {
    			insert(target, div, anchor);
    			append(div, t0);
    			append(div, t1);

    			if (text_slot) {
    				text_slot.m(div, null);
    			}

    			current = true;
    		},
    		p(ctx, dirty) {
    			if ((!current || dirty[0] & /*text*/ 2) && t0_value !== (t0_value = Utils.text(/*text*/ ctx[1]) + "")) set_data(t0, t0_value);

    			if (text_slot) {
    				if (text_slot.p && dirty[3] & /*$$scope*/ 1024) {
    					text_slot.p(get_slot_context(text_slot_template, ctx, /*$$scope*/ ctx[103], get_text_slot_context_4), get_slot_changes(text_slot_template, /*$$scope*/ ctx[103], dirty, get_text_slot_changes_4));
    				}
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
    			if (text_slot) text_slot.d(detaching);
    		}
    	};
    }

    // (923:16) {#if !(swipeout || accordionItem)}
    function create_if_block_91(ctx) {
    	let current;
    	const default_slot_template = /*$$slots*/ ctx[89].default;
    	const default_slot = create_slot(default_slot_template, ctx, /*$$scope*/ ctx[103], null);

    	return {
    		c() {
    			if (default_slot) default_slot.c();
    		},
    		m(target, anchor) {
    			if (default_slot) {
    				default_slot.m(target, anchor);
    			}

    			current = true;
    		},
    		p(ctx, dirty) {
    			if (default_slot) {
    				if (default_slot.p && dirty[3] & /*$$scope*/ 1024) {
    					default_slot.p(get_slot_context(default_slot_template, ctx, /*$$scope*/ ctx[103], null), get_slot_changes(default_slot_template, /*$$scope*/ ctx[103], dirty, null));
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
    			if (default_slot) default_slot.d(detaching);
    		}
    	};
    }

    // (926:16) {#if hasFooter}
    function create_if_block_90(ctx) {
    	let div;
    	let t0_value = Utils.text(/*footer*/ ctx[5]) + "";
    	let t0;
    	let t1;
    	let current;
    	const footer_slot_template = /*$$slots*/ ctx[89].footer;
    	const footer_slot = create_slot(footer_slot_template, ctx, /*$$scope*/ ctx[103], get_footer_slot_context_8);

    	return {
    		c() {
    			div = element("div");
    			t0 = text(t0_value);
    			t1 = space();
    			if (footer_slot) footer_slot.c();
    			attr(div, "class", "item-footer");
    		},
    		m(target, anchor) {
    			insert(target, div, anchor);
    			append(div, t0);
    			append(div, t1);

    			if (footer_slot) {
    				footer_slot.m(div, null);
    			}

    			current = true;
    		},
    		p(ctx, dirty) {
    			if ((!current || dirty[0] & /*footer*/ 32) && t0_value !== (t0_value = Utils.text(/*footer*/ ctx[5]) + "")) set_data(t0, t0_value);

    			if (footer_slot) {
    				if (footer_slot.p && dirty[3] & /*$$scope*/ 1024) {
    					footer_slot.p(get_slot_context(footer_slot_template, ctx, /*$$scope*/ ctx[103], get_footer_slot_context_8), get_slot_changes(footer_slot_template, /*$$scope*/ ctx[103], dirty, get_footer_slot_changes_8));
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
    		}
    	};
    }

    // (739:12) {#if isSortable && sortable !== false && isSortableOpposite}
    function create_if_block_87(ctx) {
    	let div;

    	return {
    		c() {
    			div = element("div");
    			attr(div, "class", "sortable-handler");
    		},
    		m(target, anchor) {
    			insert(target, div, anchor);
    		},
    		d(detaching) {
    			if (detaching) detach(div);
    		}
    	};
    }

    // (742:12) {#if hasMedia}
    function create_if_block_85(ctx) {
    	let div;
    	let t;
    	let current;
    	let if_block = typeof /*media*/ ctx[2] !== "undefined" && create_if_block_86(ctx);
    	const media_slot_template = /*$$slots*/ ctx[89].media;
    	const media_slot = create_slot(media_slot_template, ctx, /*$$scope*/ ctx[103], get_media_slot_context_3);

    	return {
    		c() {
    			div = element("div");
    			if (if_block) if_block.c();
    			t = space();
    			if (media_slot) media_slot.c();
    			attr(div, "class", "item-media");
    		},
    		m(target, anchor) {
    			insert(target, div, anchor);
    			if (if_block) if_block.m(div, null);
    			append(div, t);

    			if (media_slot) {
    				media_slot.m(div, null);
    			}

    			current = true;
    		},
    		p(ctx, dirty) {
    			if (typeof /*media*/ ctx[2] !== "undefined") {
    				if (if_block) {
    					if_block.p(ctx, dirty);
    				} else {
    					if_block = create_if_block_86(ctx);
    					if_block.c();
    					if_block.m(div, t);
    				}
    			} else if (if_block) {
    				if_block.d(1);
    				if_block = null;
    			}

    			if (media_slot) {
    				if (media_slot.p && dirty[3] & /*$$scope*/ 1024) {
    					media_slot.p(get_slot_context(media_slot_template, ctx, /*$$scope*/ ctx[103], get_media_slot_context_3), get_slot_changes(media_slot_template, /*$$scope*/ ctx[103], dirty, get_media_slot_changes_3));
    				}
    			}
    		},
    		i(local) {
    			if (current) return;
    			transition_in(media_slot, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(media_slot, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(div);
    			if (if_block) if_block.d();
    			if (media_slot) media_slot.d(detaching);
    		}
    	};
    }

    // (744:16) {#if typeof media !== 'undefined'}
    function create_if_block_86(ctx) {
    	let img;
    	let img_src_value;

    	return {
    		c() {
    			img = element("img");
    			if (img.src !== (img_src_value = /*media*/ ctx[2])) attr(img, "src", img_src_value);
    		},
    		m(target, anchor) {
    			insert(target, img, anchor);
    		},
    		p(ctx, dirty) {
    			if (dirty[0] & /*media*/ 4 && img.src !== (img_src_value = /*media*/ ctx[2])) {
    				attr(img, "src", img_src_value);
    			}
    		},
    		d(detaching) {
    			if (detaching) detach(img);
    		}
    	};
    }

    // (804:14) {:else}
    function create_else_block_6(ctx) {
    	let t0;
    	let t1;
    	let t2;
    	let t3;
    	let t4;
    	let if_block2_anchor;
    	let current;
    	const before_title_slot_template = /*$$slots*/ ctx[89]["before-title"];
    	const before_title_slot = create_slot(before_title_slot_template, ctx, /*$$scope*/ ctx[103], get_before_title_slot_context_7);
    	let if_block0 = (/*hasTitle*/ ctx[37] || /*hasHeader*/ ctx[38] || /*hasFooter*/ ctx[39]) && create_if_block_82(ctx);
    	const after_title_slot_template = /*$$slots*/ ctx[89]["after-title"];
    	const after_title_slot = create_slot(after_title_slot_template, ctx, /*$$scope*/ ctx[103], get_after_title_slot_context_7);
    	let if_block1 = /*hasAfter*/ ctx[42] && create_if_block_79(ctx);
    	const inner_slot_template = /*$$slots*/ ctx[89].inner;
    	const inner_slot = create_slot(inner_slot_template, ctx, /*$$scope*/ ctx[103], get_inner_slot_context_7);
    	let if_block2 = !(/*swipeout*/ ctx[11] || /*accordionItem*/ ctx[13]) && create_if_block_78(ctx);

    	return {
    		c() {
    			if (before_title_slot) before_title_slot.c();
    			t0 = space();
    			if (if_block0) if_block0.c();
    			t1 = space();
    			if (after_title_slot) after_title_slot.c();
    			t2 = space();
    			if (if_block1) if_block1.c();
    			t3 = space();
    			if (inner_slot) inner_slot.c();
    			t4 = space();
    			if (if_block2) if_block2.c();
    			if_block2_anchor = empty();
    		},
    		m(target, anchor) {
    			if (before_title_slot) {
    				before_title_slot.m(target, anchor);
    			}

    			insert(target, t0, anchor);
    			if (if_block0) if_block0.m(target, anchor);
    			insert(target, t1, anchor);

    			if (after_title_slot) {
    				after_title_slot.m(target, anchor);
    			}

    			insert(target, t2, anchor);
    			if (if_block1) if_block1.m(target, anchor);
    			insert(target, t3, anchor);

    			if (inner_slot) {
    				inner_slot.m(target, anchor);
    			}

    			insert(target, t4, anchor);
    			if (if_block2) if_block2.m(target, anchor);
    			insert(target, if_block2_anchor, anchor);
    			current = true;
    		},
    		p(ctx, dirty) {
    			if (before_title_slot) {
    				if (before_title_slot.p && dirty[3] & /*$$scope*/ 1024) {
    					before_title_slot.p(get_slot_context(before_title_slot_template, ctx, /*$$scope*/ ctx[103], get_before_title_slot_context_7), get_slot_changes(before_title_slot_template, /*$$scope*/ ctx[103], dirty, get_before_title_slot_changes_7));
    				}
    			}

    			if (/*hasTitle*/ ctx[37] || /*hasHeader*/ ctx[38] || /*hasFooter*/ ctx[39]) {
    				if (if_block0) {
    					if_block0.p(ctx, dirty);

    					if (dirty[1] & /*hasTitle, hasHeader, hasFooter*/ 448) {
    						transition_in(if_block0, 1);
    					}
    				} else {
    					if_block0 = create_if_block_82(ctx);
    					if_block0.c();
    					transition_in(if_block0, 1);
    					if_block0.m(t1.parentNode, t1);
    				}
    			} else if (if_block0) {
    				group_outros();

    				transition_out(if_block0, 1, 1, () => {
    					if_block0 = null;
    				});

    				check_outros();
    			}

    			if (after_title_slot) {
    				if (after_title_slot.p && dirty[3] & /*$$scope*/ 1024) {
    					after_title_slot.p(get_slot_context(after_title_slot_template, ctx, /*$$scope*/ ctx[103], get_after_title_slot_context_7), get_slot_changes(after_title_slot_template, /*$$scope*/ ctx[103], dirty, get_after_title_slot_changes_7));
    				}
    			}

    			if (/*hasAfter*/ ctx[42]) {
    				if (if_block1) {
    					if_block1.p(ctx, dirty);

    					if (dirty[1] & /*hasAfter*/ 2048) {
    						transition_in(if_block1, 1);
    					}
    				} else {
    					if_block1 = create_if_block_79(ctx);
    					if_block1.c();
    					transition_in(if_block1, 1);
    					if_block1.m(t3.parentNode, t3);
    				}
    			} else if (if_block1) {
    				group_outros();

    				transition_out(if_block1, 1, 1, () => {
    					if_block1 = null;
    				});

    				check_outros();
    			}

    			if (inner_slot) {
    				if (inner_slot.p && dirty[3] & /*$$scope*/ 1024) {
    					inner_slot.p(get_slot_context(inner_slot_template, ctx, /*$$scope*/ ctx[103], get_inner_slot_context_7), get_slot_changes(inner_slot_template, /*$$scope*/ ctx[103], dirty, get_inner_slot_changes_7));
    				}
    			}

    			if (!(/*swipeout*/ ctx[11] || /*accordionItem*/ ctx[13])) {
    				if (if_block2) {
    					if_block2.p(ctx, dirty);

    					if (dirty[0] & /*swipeout, accordionItem*/ 10240) {
    						transition_in(if_block2, 1);
    					}
    				} else {
    					if_block2 = create_if_block_78(ctx);
    					if_block2.c();
    					transition_in(if_block2, 1);
    					if_block2.m(if_block2_anchor.parentNode, if_block2_anchor);
    				}
    			} else if (if_block2) {
    				group_outros();

    				transition_out(if_block2, 1, 1, () => {
    					if_block2 = null;
    				});

    				check_outros();
    			}
    		},
    		i(local) {
    			if (current) return;
    			transition_in(before_title_slot, local);
    			transition_in(if_block0);
    			transition_in(after_title_slot, local);
    			transition_in(if_block1);
    			transition_in(inner_slot, local);
    			transition_in(if_block2);
    			current = true;
    		},
    		o(local) {
    			transition_out(before_title_slot, local);
    			transition_out(if_block0);
    			transition_out(after_title_slot, local);
    			transition_out(if_block1);
    			transition_out(inner_slot, local);
    			transition_out(if_block2);
    			current = false;
    		},
    		d(detaching) {
    			if (before_title_slot) before_title_slot.d(detaching);
    			if (detaching) detach(t0);
    			if (if_block0) if_block0.d(detaching);
    			if (detaching) detach(t1);
    			if (after_title_slot) after_title_slot.d(detaching);
    			if (detaching) detach(t2);
    			if (if_block1) if_block1.d(detaching);
    			if (detaching) detach(t3);
    			if (inner_slot) inner_slot.d(detaching);
    			if (detaching) detach(t4);
    			if (if_block2) if_block2.d(detaching);
    			if (detaching) detach(if_block2_anchor);
    		}
    	};
    }

    // (752:14) {#if isMedia}
    function create_if_block_68(ctx) {
    	let t0;
    	let div;
    	let t1;
    	let t2;
    	let t3;
    	let t4;
    	let t5;
    	let t6;
    	let t7;
    	let t8;
    	let if_block6_anchor;
    	let current;
    	let if_block0 = /*hasHeader*/ ctx[38] && create_if_block_77(ctx);
    	const before_title_slot_template = /*$$slots*/ ctx[89]["before-title"];
    	const before_title_slot = create_slot(before_title_slot_template, ctx, /*$$scope*/ ctx[103], get_before_title_slot_context_6);
    	let if_block1 = /*hasTitle*/ ctx[37] && create_if_block_76(ctx);
    	const after_title_slot_template = /*$$slots*/ ctx[89]["after-title"];
    	const after_title_slot = create_slot(after_title_slot_template, ctx, /*$$scope*/ ctx[103], get_after_title_slot_context_6);
    	let if_block2 = /*hasAfter*/ ctx[42] && create_if_block_73(ctx);
    	let if_block3 = /*hasSubtitle*/ ctx[40] && create_if_block_72(ctx);
    	let if_block4 = /*hasText*/ ctx[41] && create_if_block_71(ctx);
    	const inner_slot_template = /*$$slots*/ ctx[89].inner;
    	const inner_slot = create_slot(inner_slot_template, ctx, /*$$scope*/ ctx[103], get_inner_slot_context_6);
    	let if_block5 = !(/*swipeout*/ ctx[11] || /*accordionItem*/ ctx[13]) && create_if_block_70(ctx);
    	let if_block6 = /*hasFooter*/ ctx[39] && create_if_block_69(ctx);

    	return {
    		c() {
    			if (if_block0) if_block0.c();
    			t0 = space();
    			div = element("div");
    			if (before_title_slot) before_title_slot.c();
    			t1 = space();
    			if (if_block1) if_block1.c();
    			t2 = space();
    			if (after_title_slot) after_title_slot.c();
    			t3 = space();
    			if (if_block2) if_block2.c();
    			t4 = space();
    			if (if_block3) if_block3.c();
    			t5 = space();
    			if (if_block4) if_block4.c();
    			t6 = space();
    			if (inner_slot) inner_slot.c();
    			t7 = space();
    			if (if_block5) if_block5.c();
    			t8 = space();
    			if (if_block6) if_block6.c();
    			if_block6_anchor = empty();
    			attr(div, "class", "item-title-row");
    		},
    		m(target, anchor) {
    			if (if_block0) if_block0.m(target, anchor);
    			insert(target, t0, anchor);
    			insert(target, div, anchor);

    			if (before_title_slot) {
    				before_title_slot.m(div, null);
    			}

    			append(div, t1);
    			if (if_block1) if_block1.m(div, null);
    			append(div, t2);

    			if (after_title_slot) {
    				after_title_slot.m(div, null);
    			}

    			append(div, t3);
    			if (if_block2) if_block2.m(div, null);
    			insert(target, t4, anchor);
    			if (if_block3) if_block3.m(target, anchor);
    			insert(target, t5, anchor);
    			if (if_block4) if_block4.m(target, anchor);
    			insert(target, t6, anchor);

    			if (inner_slot) {
    				inner_slot.m(target, anchor);
    			}

    			insert(target, t7, anchor);
    			if (if_block5) if_block5.m(target, anchor);
    			insert(target, t8, anchor);
    			if (if_block6) if_block6.m(target, anchor);
    			insert(target, if_block6_anchor, anchor);
    			current = true;
    		},
    		p(ctx, dirty) {
    			if (/*hasHeader*/ ctx[38]) {
    				if (if_block0) {
    					if_block0.p(ctx, dirty);

    					if (dirty[1] & /*hasHeader*/ 128) {
    						transition_in(if_block0, 1);
    					}
    				} else {
    					if_block0 = create_if_block_77(ctx);
    					if_block0.c();
    					transition_in(if_block0, 1);
    					if_block0.m(t0.parentNode, t0);
    				}
    			} else if (if_block0) {
    				group_outros();

    				transition_out(if_block0, 1, 1, () => {
    					if_block0 = null;
    				});

    				check_outros();
    			}

    			if (before_title_slot) {
    				if (before_title_slot.p && dirty[3] & /*$$scope*/ 1024) {
    					before_title_slot.p(get_slot_context(before_title_slot_template, ctx, /*$$scope*/ ctx[103], get_before_title_slot_context_6), get_slot_changes(before_title_slot_template, /*$$scope*/ ctx[103], dirty, get_before_title_slot_changes_6));
    				}
    			}

    			if (/*hasTitle*/ ctx[37]) {
    				if (if_block1) {
    					if_block1.p(ctx, dirty);

    					if (dirty[1] & /*hasTitle*/ 64) {
    						transition_in(if_block1, 1);
    					}
    				} else {
    					if_block1 = create_if_block_76(ctx);
    					if_block1.c();
    					transition_in(if_block1, 1);
    					if_block1.m(div, t2);
    				}
    			} else if (if_block1) {
    				group_outros();

    				transition_out(if_block1, 1, 1, () => {
    					if_block1 = null;
    				});

    				check_outros();
    			}

    			if (after_title_slot) {
    				if (after_title_slot.p && dirty[3] & /*$$scope*/ 1024) {
    					after_title_slot.p(get_slot_context(after_title_slot_template, ctx, /*$$scope*/ ctx[103], get_after_title_slot_context_6), get_slot_changes(after_title_slot_template, /*$$scope*/ ctx[103], dirty, get_after_title_slot_changes_6));
    				}
    			}

    			if (/*hasAfter*/ ctx[42]) {
    				if (if_block2) {
    					if_block2.p(ctx, dirty);

    					if (dirty[1] & /*hasAfter*/ 2048) {
    						transition_in(if_block2, 1);
    					}
    				} else {
    					if_block2 = create_if_block_73(ctx);
    					if_block2.c();
    					transition_in(if_block2, 1);
    					if_block2.m(div, null);
    				}
    			} else if (if_block2) {
    				group_outros();

    				transition_out(if_block2, 1, 1, () => {
    					if_block2 = null;
    				});

    				check_outros();
    			}

    			if (/*hasSubtitle*/ ctx[40]) {
    				if (if_block3) {
    					if_block3.p(ctx, dirty);

    					if (dirty[1] & /*hasSubtitle*/ 512) {
    						transition_in(if_block3, 1);
    					}
    				} else {
    					if_block3 = create_if_block_72(ctx);
    					if_block3.c();
    					transition_in(if_block3, 1);
    					if_block3.m(t5.parentNode, t5);
    				}
    			} else if (if_block3) {
    				group_outros();

    				transition_out(if_block3, 1, 1, () => {
    					if_block3 = null;
    				});

    				check_outros();
    			}

    			if (/*hasText*/ ctx[41]) {
    				if (if_block4) {
    					if_block4.p(ctx, dirty);

    					if (dirty[1] & /*hasText*/ 1024) {
    						transition_in(if_block4, 1);
    					}
    				} else {
    					if_block4 = create_if_block_71(ctx);
    					if_block4.c();
    					transition_in(if_block4, 1);
    					if_block4.m(t6.parentNode, t6);
    				}
    			} else if (if_block4) {
    				group_outros();

    				transition_out(if_block4, 1, 1, () => {
    					if_block4 = null;
    				});

    				check_outros();
    			}

    			if (inner_slot) {
    				if (inner_slot.p && dirty[3] & /*$$scope*/ 1024) {
    					inner_slot.p(get_slot_context(inner_slot_template, ctx, /*$$scope*/ ctx[103], get_inner_slot_context_6), get_slot_changes(inner_slot_template, /*$$scope*/ ctx[103], dirty, get_inner_slot_changes_6));
    				}
    			}

    			if (!(/*swipeout*/ ctx[11] || /*accordionItem*/ ctx[13])) {
    				if (if_block5) {
    					if_block5.p(ctx, dirty);

    					if (dirty[0] & /*swipeout, accordionItem*/ 10240) {
    						transition_in(if_block5, 1);
    					}
    				} else {
    					if_block5 = create_if_block_70(ctx);
    					if_block5.c();
    					transition_in(if_block5, 1);
    					if_block5.m(t8.parentNode, t8);
    				}
    			} else if (if_block5) {
    				group_outros();

    				transition_out(if_block5, 1, 1, () => {
    					if_block5 = null;
    				});

    				check_outros();
    			}

    			if (/*hasFooter*/ ctx[39]) {
    				if (if_block6) {
    					if_block6.p(ctx, dirty);

    					if (dirty[1] & /*hasFooter*/ 256) {
    						transition_in(if_block6, 1);
    					}
    				} else {
    					if_block6 = create_if_block_69(ctx);
    					if_block6.c();
    					transition_in(if_block6, 1);
    					if_block6.m(if_block6_anchor.parentNode, if_block6_anchor);
    				}
    			} else if (if_block6) {
    				group_outros();

    				transition_out(if_block6, 1, 1, () => {
    					if_block6 = null;
    				});

    				check_outros();
    			}
    		},
    		i(local) {
    			if (current) return;
    			transition_in(if_block0);
    			transition_in(before_title_slot, local);
    			transition_in(if_block1);
    			transition_in(after_title_slot, local);
    			transition_in(if_block2);
    			transition_in(if_block3);
    			transition_in(if_block4);
    			transition_in(inner_slot, local);
    			transition_in(if_block5);
    			transition_in(if_block6);
    			current = true;
    		},
    		o(local) {
    			transition_out(if_block0);
    			transition_out(before_title_slot, local);
    			transition_out(if_block1);
    			transition_out(after_title_slot, local);
    			transition_out(if_block2);
    			transition_out(if_block3);
    			transition_out(if_block4);
    			transition_out(inner_slot, local);
    			transition_out(if_block5);
    			transition_out(if_block6);
    			current = false;
    		},
    		d(detaching) {
    			if (if_block0) if_block0.d(detaching);
    			if (detaching) detach(t0);
    			if (detaching) detach(div);
    			if (before_title_slot) before_title_slot.d(detaching);
    			if (if_block1) if_block1.d();
    			if (after_title_slot) after_title_slot.d(detaching);
    			if (if_block2) if_block2.d();
    			if (detaching) detach(t4);
    			if (if_block3) if_block3.d(detaching);
    			if (detaching) detach(t5);
    			if (if_block4) if_block4.d(detaching);
    			if (detaching) detach(t6);
    			if (inner_slot) inner_slot.d(detaching);
    			if (detaching) detach(t7);
    			if (if_block5) if_block5.d(detaching);
    			if (detaching) detach(t8);
    			if (if_block6) if_block6.d(detaching);
    			if (detaching) detach(if_block6_anchor);
    		}
    	};
    }

    // (806:16) {#if (hasTitle || hasHeader || hasFooter)}
    function create_if_block_82(ctx) {
    	let div;
    	let t0;
    	let t1_value = Utils.text(/*title*/ ctx[0]) + "";
    	let t1;
    	let t2;
    	let t3;
    	let current;
    	let if_block0 = /*hasHeader*/ ctx[38] && create_if_block_84(ctx);
    	const title_slot_template = /*$$slots*/ ctx[89].title;
    	const title_slot = create_slot(title_slot_template, ctx, /*$$scope*/ ctx[103], get_title_slot_context_7);
    	let if_block1 = /*hasFooter*/ ctx[39] && create_if_block_83(ctx);

    	return {
    		c() {
    			div = element("div");
    			if (if_block0) if_block0.c();
    			t0 = space();
    			t1 = text(t1_value);
    			t2 = space();
    			if (title_slot) title_slot.c();
    			t3 = space();
    			if (if_block1) if_block1.c();
    			attr(div, "class", "item-title");
    		},
    		m(target, anchor) {
    			insert(target, div, anchor);
    			if (if_block0) if_block0.m(div, null);
    			append(div, t0);
    			append(div, t1);
    			append(div, t2);

    			if (title_slot) {
    				title_slot.m(div, null);
    			}

    			append(div, t3);
    			if (if_block1) if_block1.m(div, null);
    			current = true;
    		},
    		p(ctx, dirty) {
    			if (/*hasHeader*/ ctx[38]) {
    				if (if_block0) {
    					if_block0.p(ctx, dirty);

    					if (dirty[1] & /*hasHeader*/ 128) {
    						transition_in(if_block0, 1);
    					}
    				} else {
    					if_block0 = create_if_block_84(ctx);
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

    			if ((!current || dirty[0] & /*title*/ 1) && t1_value !== (t1_value = Utils.text(/*title*/ ctx[0]) + "")) set_data(t1, t1_value);

    			if (title_slot) {
    				if (title_slot.p && dirty[3] & /*$$scope*/ 1024) {
    					title_slot.p(get_slot_context(title_slot_template, ctx, /*$$scope*/ ctx[103], get_title_slot_context_7), get_slot_changes(title_slot_template, /*$$scope*/ ctx[103], dirty, get_title_slot_changes_7));
    				}
    			}

    			if (/*hasFooter*/ ctx[39]) {
    				if (if_block1) {
    					if_block1.p(ctx, dirty);

    					if (dirty[1] & /*hasFooter*/ 256) {
    						transition_in(if_block1, 1);
    					}
    				} else {
    					if_block1 = create_if_block_83(ctx);
    					if_block1.c();
    					transition_in(if_block1, 1);
    					if_block1.m(div, null);
    				}
    			} else if (if_block1) {
    				group_outros();

    				transition_out(if_block1, 1, 1, () => {
    					if_block1 = null;
    				});

    				check_outros();
    			}
    		},
    		i(local) {
    			if (current) return;
    			transition_in(if_block0);
    			transition_in(title_slot, local);
    			transition_in(if_block1);
    			current = true;
    		},
    		o(local) {
    			transition_out(if_block0);
    			transition_out(title_slot, local);
    			transition_out(if_block1);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(div);
    			if (if_block0) if_block0.d();
    			if (title_slot) title_slot.d(detaching);
    			if (if_block1) if_block1.d();
    		}
    	};
    }

    // (808:20) {#if hasHeader}
    function create_if_block_84(ctx) {
    	let div;
    	let t0_value = Utils.text(/*header*/ ctx[4]) + "";
    	let t0;
    	let t1;
    	let current;
    	const header_slot_template = /*$$slots*/ ctx[89].header;
    	const header_slot = create_slot(header_slot_template, ctx, /*$$scope*/ ctx[103], get_header_slot_context_7);

    	return {
    		c() {
    			div = element("div");
    			t0 = text(t0_value);
    			t1 = space();
    			if (header_slot) header_slot.c();
    			attr(div, "class", "item-header");
    		},
    		m(target, anchor) {
    			insert(target, div, anchor);
    			append(div, t0);
    			append(div, t1);

    			if (header_slot) {
    				header_slot.m(div, null);
    			}

    			current = true;
    		},
    		p(ctx, dirty) {
    			if ((!current || dirty[0] & /*header*/ 16) && t0_value !== (t0_value = Utils.text(/*header*/ ctx[4]) + "")) set_data(t0, t0_value);

    			if (header_slot) {
    				if (header_slot.p && dirty[3] & /*$$scope*/ 1024) {
    					header_slot.p(get_slot_context(header_slot_template, ctx, /*$$scope*/ ctx[103], get_header_slot_context_7), get_slot_changes(header_slot_template, /*$$scope*/ ctx[103], dirty, get_header_slot_changes_7));
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
    		}
    	};
    }

    // (816:20) {#if hasFooter}
    function create_if_block_83(ctx) {
    	let div;
    	let t0_value = Utils.text(/*footer*/ ctx[5]) + "";
    	let t0;
    	let t1;
    	let current;
    	const footer_slot_template = /*$$slots*/ ctx[89].footer;
    	const footer_slot = create_slot(footer_slot_template, ctx, /*$$scope*/ ctx[103], get_footer_slot_context_7);

    	return {
    		c() {
    			div = element("div");
    			t0 = text(t0_value);
    			t1 = space();
    			if (footer_slot) footer_slot.c();
    			attr(div, "class", "item-footer");
    		},
    		m(target, anchor) {
    			insert(target, div, anchor);
    			append(div, t0);
    			append(div, t1);

    			if (footer_slot) {
    				footer_slot.m(div, null);
    			}

    			current = true;
    		},
    		p(ctx, dirty) {
    			if ((!current || dirty[0] & /*footer*/ 32) && t0_value !== (t0_value = Utils.text(/*footer*/ ctx[5]) + "")) set_data(t0, t0_value);

    			if (footer_slot) {
    				if (footer_slot.p && dirty[3] & /*$$scope*/ 1024) {
    					footer_slot.p(get_slot_context(footer_slot_template, ctx, /*$$scope*/ ctx[103], get_footer_slot_context_7), get_slot_changes(footer_slot_template, /*$$scope*/ ctx[103], dirty, get_footer_slot_changes_7));
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
    		}
    	};
    }

    // (825:16) {#if hasAfter}
    function create_if_block_79(ctx) {
    	let div;
    	let t0;
    	let t1;
    	let t2;
    	let t3;
    	let current;
    	const after_start_slot_template = /*$$slots*/ ctx[89]["after-start"];
    	const after_start_slot = create_slot(after_start_slot_template, ctx, /*$$scope*/ ctx[103], get_after_start_slot_context_7);
    	let if_block0 = typeof /*after*/ ctx[6] !== "undefined" && create_if_block_81(ctx);
    	let if_block1 = typeof /*badge*/ ctx[7] !== "undefined" && create_if_block_80(ctx);
    	const after_slot_template = /*$$slots*/ ctx[89].after;
    	const after_slot = create_slot(after_slot_template, ctx, /*$$scope*/ ctx[103], get_after_slot_context_7);
    	const after_end_slot_template = /*$$slots*/ ctx[89]["after-end"];
    	const after_end_slot = create_slot(after_end_slot_template, ctx, /*$$scope*/ ctx[103], get_after_end_slot_context_7);

    	return {
    		c() {
    			div = element("div");
    			if (after_start_slot) after_start_slot.c();
    			t0 = space();
    			if (if_block0) if_block0.c();
    			t1 = space();
    			if (if_block1) if_block1.c();
    			t2 = space();
    			if (after_slot) after_slot.c();
    			t3 = space();
    			if (after_end_slot) after_end_slot.c();
    			attr(div, "class", "item-after");
    		},
    		m(target, anchor) {
    			insert(target, div, anchor);

    			if (after_start_slot) {
    				after_start_slot.m(div, null);
    			}

    			append(div, t0);
    			if (if_block0) if_block0.m(div, null);
    			append(div, t1);
    			if (if_block1) if_block1.m(div, null);
    			append(div, t2);

    			if (after_slot) {
    				after_slot.m(div, null);
    			}

    			append(div, t3);

    			if (after_end_slot) {
    				after_end_slot.m(div, null);
    			}

    			current = true;
    		},
    		p(ctx, dirty) {
    			if (after_start_slot) {
    				if (after_start_slot.p && dirty[3] & /*$$scope*/ 1024) {
    					after_start_slot.p(get_slot_context(after_start_slot_template, ctx, /*$$scope*/ ctx[103], get_after_start_slot_context_7), get_slot_changes(after_start_slot_template, /*$$scope*/ ctx[103], dirty, get_after_start_slot_changes_7));
    				}
    			}

    			if (typeof /*after*/ ctx[6] !== "undefined") {
    				if (if_block0) {
    					if_block0.p(ctx, dirty);
    				} else {
    					if_block0 = create_if_block_81(ctx);
    					if_block0.c();
    					if_block0.m(div, t1);
    				}
    			} else if (if_block0) {
    				if_block0.d(1);
    				if_block0 = null;
    			}

    			if (typeof /*badge*/ ctx[7] !== "undefined") {
    				if (if_block1) {
    					if_block1.p(ctx, dirty);

    					if (dirty[0] & /*badge*/ 128) {
    						transition_in(if_block1, 1);
    					}
    				} else {
    					if_block1 = create_if_block_80(ctx);
    					if_block1.c();
    					transition_in(if_block1, 1);
    					if_block1.m(div, t2);
    				}
    			} else if (if_block1) {
    				group_outros();

    				transition_out(if_block1, 1, 1, () => {
    					if_block1 = null;
    				});

    				check_outros();
    			}

    			if (after_slot) {
    				if (after_slot.p && dirty[3] & /*$$scope*/ 1024) {
    					after_slot.p(get_slot_context(after_slot_template, ctx, /*$$scope*/ ctx[103], get_after_slot_context_7), get_slot_changes(after_slot_template, /*$$scope*/ ctx[103], dirty, get_after_slot_changes_7));
    				}
    			}

    			if (after_end_slot) {
    				if (after_end_slot.p && dirty[3] & /*$$scope*/ 1024) {
    					after_end_slot.p(get_slot_context(after_end_slot_template, ctx, /*$$scope*/ ctx[103], get_after_end_slot_context_7), get_slot_changes(after_end_slot_template, /*$$scope*/ ctx[103], dirty, get_after_end_slot_changes_7));
    				}
    			}
    		},
    		i(local) {
    			if (current) return;
    			transition_in(after_start_slot, local);
    			transition_in(if_block1);
    			transition_in(after_slot, local);
    			transition_in(after_end_slot, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(after_start_slot, local);
    			transition_out(if_block1);
    			transition_out(after_slot, local);
    			transition_out(after_end_slot, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(div);
    			if (after_start_slot) after_start_slot.d(detaching);
    			if (if_block0) if_block0.d();
    			if (if_block1) if_block1.d();
    			if (after_slot) after_slot.d(detaching);
    			if (after_end_slot) after_end_slot.d(detaching);
    		}
    	};
    }

    // (828:20) {#if typeof after !== 'undefined'}
    function create_if_block_81(ctx) {
    	let span;
    	let t_value = Utils.text(/*after*/ ctx[6]) + "";
    	let t;

    	return {
    		c() {
    			span = element("span");
    			t = text(t_value);
    		},
    		m(target, anchor) {
    			insert(target, span, anchor);
    			append(span, t);
    		},
    		p(ctx, dirty) {
    			if (dirty[0] & /*after*/ 64 && t_value !== (t_value = Utils.text(/*after*/ ctx[6]) + "")) set_data(t, t_value);
    		},
    		d(detaching) {
    			if (detaching) detach(span);
    		}
    	};
    }

    // (831:20) {#if typeof badge !== 'undefined'}
    function create_if_block_80(ctx) {
    	let current;

    	const badge_1 = new Badge({
    			props: {
    				color: /*badgeColor*/ ctx[8],
    				$$slots: { default: [create_default_slot_7] },
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
    			if (dirty[0] & /*badgeColor*/ 256) badge_1_changes.color = /*badgeColor*/ ctx[8];

    			if (dirty[0] & /*badge*/ 128 | dirty[3] & /*$$scope*/ 1024) {
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

    // (832:22) <Badge color={badgeColor}>
    function create_default_slot_7(ctx) {
    	let t_value = Utils.text(/*badge*/ ctx[7]) + "";
    	let t;

    	return {
    		c() {
    			t = text(t_value);
    		},
    		m(target, anchor) {
    			insert(target, t, anchor);
    		},
    		p(ctx, dirty) {
    			if (dirty[0] & /*badge*/ 128 && t_value !== (t_value = Utils.text(/*badge*/ ctx[7]) + "")) set_data(t, t_value);
    		},
    		d(detaching) {
    			if (detaching) detach(t);
    		}
    	};
    }

    // (839:16) {#if !(swipeout || accordionItem)}
    function create_if_block_78(ctx) {
    	let current;
    	const default_slot_template = /*$$slots*/ ctx[89].default;
    	const default_slot = create_slot(default_slot_template, ctx, /*$$scope*/ ctx[103], null);

    	return {
    		c() {
    			if (default_slot) default_slot.c();
    		},
    		m(target, anchor) {
    			if (default_slot) {
    				default_slot.m(target, anchor);
    			}

    			current = true;
    		},
    		p(ctx, dirty) {
    			if (default_slot) {
    				if (default_slot.p && dirty[3] & /*$$scope*/ 1024) {
    					default_slot.p(get_slot_context(default_slot_template, ctx, /*$$scope*/ ctx[103], null), get_slot_changes(default_slot_template, /*$$scope*/ ctx[103], dirty, null));
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
    			if (default_slot) default_slot.d(detaching);
    		}
    	};
    }

    // (753:16) {#if hasHeader}
    function create_if_block_77(ctx) {
    	let div;
    	let t0_value = Utils.text(/*header*/ ctx[4]) + "";
    	let t0;
    	let t1;
    	let current;
    	const header_slot_template = /*$$slots*/ ctx[89].header;
    	const header_slot = create_slot(header_slot_template, ctx, /*$$scope*/ ctx[103], get_header_slot_context_6);

    	return {
    		c() {
    			div = element("div");
    			t0 = text(t0_value);
    			t1 = space();
    			if (header_slot) header_slot.c();
    			attr(div, "class", "item-header");
    		},
    		m(target, anchor) {
    			insert(target, div, anchor);
    			append(div, t0);
    			append(div, t1);

    			if (header_slot) {
    				header_slot.m(div, null);
    			}

    			current = true;
    		},
    		p(ctx, dirty) {
    			if ((!current || dirty[0] & /*header*/ 16) && t0_value !== (t0_value = Utils.text(/*header*/ ctx[4]) + "")) set_data(t0, t0_value);

    			if (header_slot) {
    				if (header_slot.p && dirty[3] & /*$$scope*/ 1024) {
    					header_slot.p(get_slot_context(header_slot_template, ctx, /*$$scope*/ ctx[103], get_header_slot_context_6), get_slot_changes(header_slot_template, /*$$scope*/ ctx[103], dirty, get_header_slot_changes_6));
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
    		}
    	};
    }

    // (761:18) {#if (hasTitle)}
    function create_if_block_76(ctx) {
    	let div;
    	let t0_value = Utils.text(/*title*/ ctx[0]) + "";
    	let t0;
    	let t1;
    	let current;
    	const title_slot_template = /*$$slots*/ ctx[89].title;
    	const title_slot = create_slot(title_slot_template, ctx, /*$$scope*/ ctx[103], get_title_slot_context_6);

    	return {
    		c() {
    			div = element("div");
    			t0 = text(t0_value);
    			t1 = space();
    			if (title_slot) title_slot.c();
    			attr(div, "class", "item-title");
    		},
    		m(target, anchor) {
    			insert(target, div, anchor);
    			append(div, t0);
    			append(div, t1);

    			if (title_slot) {
    				title_slot.m(div, null);
    			}

    			current = true;
    		},
    		p(ctx, dirty) {
    			if ((!current || dirty[0] & /*title*/ 1) && t0_value !== (t0_value = Utils.text(/*title*/ ctx[0]) + "")) set_data(t0, t0_value);

    			if (title_slot) {
    				if (title_slot.p && dirty[3] & /*$$scope*/ 1024) {
    					title_slot.p(get_slot_context(title_slot_template, ctx, /*$$scope*/ ctx[103], get_title_slot_context_6), get_slot_changes(title_slot_template, /*$$scope*/ ctx[103], dirty, get_title_slot_changes_6));
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
    			if (detaching) detach(div);
    			if (title_slot) title_slot.d(detaching);
    		}
    	};
    }

    // (768:18) {#if hasAfter}
    function create_if_block_73(ctx) {
    	let div;
    	let t0;
    	let t1;
    	let t2;
    	let t3;
    	let current;
    	const after_start_slot_template = /*$$slots*/ ctx[89]["after-start"];
    	const after_start_slot = create_slot(after_start_slot_template, ctx, /*$$scope*/ ctx[103], get_after_start_slot_context_6);
    	let if_block0 = typeof /*after*/ ctx[6] !== "undefined" && create_if_block_75(ctx);
    	let if_block1 = typeof /*badge*/ ctx[7] !== "undefined" && create_if_block_74(ctx);
    	const after_slot_template = /*$$slots*/ ctx[89].after;
    	const after_slot = create_slot(after_slot_template, ctx, /*$$scope*/ ctx[103], get_after_slot_context_6);
    	const after_end_slot_template = /*$$slots*/ ctx[89]["after-end"];
    	const after_end_slot = create_slot(after_end_slot_template, ctx, /*$$scope*/ ctx[103], get_after_end_slot_context_6);

    	return {
    		c() {
    			div = element("div");
    			if (after_start_slot) after_start_slot.c();
    			t0 = space();
    			if (if_block0) if_block0.c();
    			t1 = space();
    			if (if_block1) if_block1.c();
    			t2 = space();
    			if (after_slot) after_slot.c();
    			t3 = space();
    			if (after_end_slot) after_end_slot.c();
    			attr(div, "class", "item-after");
    		},
    		m(target, anchor) {
    			insert(target, div, anchor);

    			if (after_start_slot) {
    				after_start_slot.m(div, null);
    			}

    			append(div, t0);
    			if (if_block0) if_block0.m(div, null);
    			append(div, t1);
    			if (if_block1) if_block1.m(div, null);
    			append(div, t2);

    			if (after_slot) {
    				after_slot.m(div, null);
    			}

    			append(div, t3);

    			if (after_end_slot) {
    				after_end_slot.m(div, null);
    			}

    			current = true;
    		},
    		p(ctx, dirty) {
    			if (after_start_slot) {
    				if (after_start_slot.p && dirty[3] & /*$$scope*/ 1024) {
    					after_start_slot.p(get_slot_context(after_start_slot_template, ctx, /*$$scope*/ ctx[103], get_after_start_slot_context_6), get_slot_changes(after_start_slot_template, /*$$scope*/ ctx[103], dirty, get_after_start_slot_changes_6));
    				}
    			}

    			if (typeof /*after*/ ctx[6] !== "undefined") {
    				if (if_block0) {
    					if_block0.p(ctx, dirty);
    				} else {
    					if_block0 = create_if_block_75(ctx);
    					if_block0.c();
    					if_block0.m(div, t1);
    				}
    			} else if (if_block0) {
    				if_block0.d(1);
    				if_block0 = null;
    			}

    			if (typeof /*badge*/ ctx[7] !== "undefined") {
    				if (if_block1) {
    					if_block1.p(ctx, dirty);

    					if (dirty[0] & /*badge*/ 128) {
    						transition_in(if_block1, 1);
    					}
    				} else {
    					if_block1 = create_if_block_74(ctx);
    					if_block1.c();
    					transition_in(if_block1, 1);
    					if_block1.m(div, t2);
    				}
    			} else if (if_block1) {
    				group_outros();

    				transition_out(if_block1, 1, 1, () => {
    					if_block1 = null;
    				});

    				check_outros();
    			}

    			if (after_slot) {
    				if (after_slot.p && dirty[3] & /*$$scope*/ 1024) {
    					after_slot.p(get_slot_context(after_slot_template, ctx, /*$$scope*/ ctx[103], get_after_slot_context_6), get_slot_changes(after_slot_template, /*$$scope*/ ctx[103], dirty, get_after_slot_changes_6));
    				}
    			}

    			if (after_end_slot) {
    				if (after_end_slot.p && dirty[3] & /*$$scope*/ 1024) {
    					after_end_slot.p(get_slot_context(after_end_slot_template, ctx, /*$$scope*/ ctx[103], get_after_end_slot_context_6), get_slot_changes(after_end_slot_template, /*$$scope*/ ctx[103], dirty, get_after_end_slot_changes_6));
    				}
    			}
    		},
    		i(local) {
    			if (current) return;
    			transition_in(after_start_slot, local);
    			transition_in(if_block1);
    			transition_in(after_slot, local);
    			transition_in(after_end_slot, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(after_start_slot, local);
    			transition_out(if_block1);
    			transition_out(after_slot, local);
    			transition_out(after_end_slot, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(div);
    			if (after_start_slot) after_start_slot.d(detaching);
    			if (if_block0) if_block0.d();
    			if (if_block1) if_block1.d();
    			if (after_slot) after_slot.d(detaching);
    			if (after_end_slot) after_end_slot.d(detaching);
    		}
    	};
    }

    // (771:22) {#if typeof after !== 'undefined'}
    function create_if_block_75(ctx) {
    	let span;
    	let t_value = Utils.text(/*after*/ ctx[6]) + "";
    	let t;

    	return {
    		c() {
    			span = element("span");
    			t = text(t_value);
    		},
    		m(target, anchor) {
    			insert(target, span, anchor);
    			append(span, t);
    		},
    		p(ctx, dirty) {
    			if (dirty[0] & /*after*/ 64 && t_value !== (t_value = Utils.text(/*after*/ ctx[6]) + "")) set_data(t, t_value);
    		},
    		d(detaching) {
    			if (detaching) detach(span);
    		}
    	};
    }

    // (774:22) {#if typeof badge !== 'undefined'}
    function create_if_block_74(ctx) {
    	let current;

    	const badge_1 = new Badge({
    			props: {
    				color: /*badgeColor*/ ctx[8],
    				$$slots: { default: [create_default_slot_6] },
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
    			if (dirty[0] & /*badgeColor*/ 256) badge_1_changes.color = /*badgeColor*/ ctx[8];

    			if (dirty[0] & /*badge*/ 128 | dirty[3] & /*$$scope*/ 1024) {
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

    // (775:24) <Badge color={badgeColor}>
    function create_default_slot_6(ctx) {
    	let t_value = Utils.text(/*badge*/ ctx[7]) + "";
    	let t;

    	return {
    		c() {
    			t = text(t_value);
    		},
    		m(target, anchor) {
    			insert(target, t, anchor);
    		},
    		p(ctx, dirty) {
    			if (dirty[0] & /*badge*/ 128 && t_value !== (t_value = Utils.text(/*badge*/ ctx[7]) + "")) set_data(t, t_value);
    		},
    		d(detaching) {
    			if (detaching) detach(t);
    		}
    	};
    }

    // (782:16) {#if hasSubtitle}
    function create_if_block_72(ctx) {
    	let div;
    	let t0_value = Utils.text(/*subtitle*/ ctx[3]) + "";
    	let t0;
    	let t1;
    	let current;
    	const subtitle_slot_template = /*$$slots*/ ctx[89].subtitle;
    	const subtitle_slot = create_slot(subtitle_slot_template, ctx, /*$$scope*/ ctx[103], get_subtitle_slot_context_3);

    	return {
    		c() {
    			div = element("div");
    			t0 = text(t0_value);
    			t1 = space();
    			if (subtitle_slot) subtitle_slot.c();
    			attr(div, "class", "item-subtitle");
    		},
    		m(target, anchor) {
    			insert(target, div, anchor);
    			append(div, t0);
    			append(div, t1);

    			if (subtitle_slot) {
    				subtitle_slot.m(div, null);
    			}

    			current = true;
    		},
    		p(ctx, dirty) {
    			if ((!current || dirty[0] & /*subtitle*/ 8) && t0_value !== (t0_value = Utils.text(/*subtitle*/ ctx[3]) + "")) set_data(t0, t0_value);

    			if (subtitle_slot) {
    				if (subtitle_slot.p && dirty[3] & /*$$scope*/ 1024) {
    					subtitle_slot.p(get_slot_context(subtitle_slot_template, ctx, /*$$scope*/ ctx[103], get_subtitle_slot_context_3), get_slot_changes(subtitle_slot_template, /*$$scope*/ ctx[103], dirty, get_subtitle_slot_changes_3));
    				}
    			}
    		},
    		i(local) {
    			if (current) return;
    			transition_in(subtitle_slot, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(subtitle_slot, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(div);
    			if (subtitle_slot) subtitle_slot.d(detaching);
    		}
    	};
    }

    // (788:16) {#if hasText}
    function create_if_block_71(ctx) {
    	let div;
    	let t0_value = Utils.text(/*text*/ ctx[1]) + "";
    	let t0;
    	let t1;
    	let current;
    	const text_slot_template = /*$$slots*/ ctx[89].text;
    	const text_slot = create_slot(text_slot_template, ctx, /*$$scope*/ ctx[103], get_text_slot_context_3);

    	return {
    		c() {
    			div = element("div");
    			t0 = text(t0_value);
    			t1 = space();
    			if (text_slot) text_slot.c();
    			attr(div, "class", "item-text");
    		},
    		m(target, anchor) {
    			insert(target, div, anchor);
    			append(div, t0);
    			append(div, t1);

    			if (text_slot) {
    				text_slot.m(div, null);
    			}

    			current = true;
    		},
    		p(ctx, dirty) {
    			if ((!current || dirty[0] & /*text*/ 2) && t0_value !== (t0_value = Utils.text(/*text*/ ctx[1]) + "")) set_data(t0, t0_value);

    			if (text_slot) {
    				if (text_slot.p && dirty[3] & /*$$scope*/ 1024) {
    					text_slot.p(get_slot_context(text_slot_template, ctx, /*$$scope*/ ctx[103], get_text_slot_context_3), get_slot_changes(text_slot_template, /*$$scope*/ ctx[103], dirty, get_text_slot_changes_3));
    				}
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
    			if (text_slot) text_slot.d(detaching);
    		}
    	};
    }

    // (795:16) {#if !(swipeout || accordionItem)}
    function create_if_block_70(ctx) {
    	let current;
    	const default_slot_template = /*$$slots*/ ctx[89].default;
    	const default_slot = create_slot(default_slot_template, ctx, /*$$scope*/ ctx[103], null);

    	return {
    		c() {
    			if (default_slot) default_slot.c();
    		},
    		m(target, anchor) {
    			if (default_slot) {
    				default_slot.m(target, anchor);
    			}

    			current = true;
    		},
    		p(ctx, dirty) {
    			if (default_slot) {
    				if (default_slot.p && dirty[3] & /*$$scope*/ 1024) {
    					default_slot.p(get_slot_context(default_slot_template, ctx, /*$$scope*/ ctx[103], null), get_slot_changes(default_slot_template, /*$$scope*/ ctx[103], dirty, null));
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
    			if (default_slot) default_slot.d(detaching);
    		}
    	};
    }

    // (798:16) {#if hasFooter}
    function create_if_block_69(ctx) {
    	let div;
    	let t0_value = Utils.text(/*footer*/ ctx[5]) + "";
    	let t0;
    	let t1;
    	let current;
    	const footer_slot_template = /*$$slots*/ ctx[89].footer;
    	const footer_slot = create_slot(footer_slot_template, ctx, /*$$scope*/ ctx[103], get_footer_slot_context_6);

    	return {
    		c() {
    			div = element("div");
    			t0 = text(t0_value);
    			t1 = space();
    			if (footer_slot) footer_slot.c();
    			attr(div, "class", "item-footer");
    		},
    		m(target, anchor) {
    			insert(target, div, anchor);
    			append(div, t0);
    			append(div, t1);

    			if (footer_slot) {
    				footer_slot.m(div, null);
    			}

    			current = true;
    		},
    		p(ctx, dirty) {
    			if ((!current || dirty[0] & /*footer*/ 32) && t0_value !== (t0_value = Utils.text(/*footer*/ ctx[5]) + "")) set_data(t0, t0_value);

    			if (footer_slot) {
    				if (footer_slot.p && dirty[3] & /*$$scope*/ 1024) {
    					footer_slot.p(get_slot_context(footer_slot_template, ctx, /*$$scope*/ ctx[103], get_footer_slot_context_6), get_slot_changes(footer_slot_template, /*$$scope*/ ctx[103], dirty, get_footer_slot_changes_6));
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
    		}
    	};
    }

    // (491:8) {:else}
    function create_else_block_2(ctx) {
    	let current_block_type_index;
    	let if_block;
    	let if_block_anchor;
    	let current;
    	const if_block_creators = [create_if_block_26, create_else_block_4];
    	const if_blocks = [];

    	function select_block_type_4(ctx, dirty) {
    		if (/*checkbox*/ ctx[14] || /*radio*/ ctx[15]) return 0;
    		return 1;
    	}

    	current_block_type_index = select_block_type_4(ctx);
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
    			current_block_type_index = select_block_type_4(ctx);

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

    // (375:8) {#if isLink}
    function create_if_block_5(ctx) {
    	let a;
    	let div1;
    	let t0;
    	let t1;
    	let t2;
    	let div0;
    	let t3;
    	let current_block_type_index;
    	let if_block2;
    	let t4;
    	let t5;
    	let t6;
    	let current;
    	let dispose;
    	const content_start_slot_template = /*$$slots*/ ctx[89]["content-start"];
    	const content_start_slot = create_slot(content_start_slot_template, ctx, /*$$scope*/ ctx[103], get_content_start_slot_context);
    	let if_block0 = /*isSortable*/ ctx[28] && /*sortable*/ ctx[12] !== false && /*isSortableOpposite*/ ctx[29] && create_if_block_25();
    	let if_block1 = /*hasMedia*/ ctx[36] && create_if_block_23(ctx);
    	const inner_start_slot_template = /*$$slots*/ ctx[89]["inner-start"];
    	const inner_start_slot = create_slot(inner_start_slot_template, ctx, /*$$scope*/ ctx[103], get_inner_start_slot_context);
    	const if_block_creators = [create_if_block_6, create_else_block_1];
    	const if_blocks = [];

    	function select_block_type_3(ctx, dirty) {
    		if (/*isMedia*/ ctx[27]) return 0;
    		return 1;
    	}

    	current_block_type_index = select_block_type_3(ctx);
    	if_block2 = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);
    	const inner_end_slot_template = /*$$slots*/ ctx[89]["inner-end"];
    	const inner_end_slot = create_slot(inner_end_slot_template, ctx, /*$$scope*/ ctx[103], get_inner_end_slot_context);
    	const content_slot_template = /*$$slots*/ ctx[89].content;
    	const content_slot = create_slot(content_slot_template, ctx, /*$$scope*/ ctx[103], get_content_slot_context$1);
    	const content_end_slot_template = /*$$slots*/ ctx[89]["content-end"];
    	const content_end_slot = create_slot(content_end_slot_template, ctx, /*$$scope*/ ctx[103], get_content_end_slot_context);
    	let a_levels = [{ class: /*linkClasses*/ ctx[33] }, /*linkAttrs*/ ctx[34]];
    	let a_data = {};

    	for (let i = 0; i < a_levels.length; i += 1) {
    		a_data = assign(a_data, a_levels[i]);
    	}

    	return {
    		c() {
    			a = element("a");
    			div1 = element("div");
    			if (content_start_slot) content_start_slot.c();
    			t0 = space();
    			if (if_block0) if_block0.c();
    			t1 = space();
    			if (if_block1) if_block1.c();
    			t2 = space();
    			div0 = element("div");
    			if (inner_start_slot) inner_start_slot.c();
    			t3 = space();
    			if_block2.c();
    			t4 = space();
    			if (inner_end_slot) inner_end_slot.c();
    			t5 = space();
    			if (content_slot) content_slot.c();
    			t6 = space();
    			if (content_end_slot) content_end_slot.c();
    			attr(div0, "class", "item-inner");
    			attr(div1, "class", /*contentClasses*/ ctx[32]);
    			set_attributes(a, a_data);
    		},
    		m(target, anchor, remount) {
    			insert(target, a, anchor);
    			append(a, div1);

    			if (content_start_slot) {
    				content_start_slot.m(div1, null);
    			}

    			append(div1, t0);
    			if (if_block0) if_block0.m(div1, null);
    			append(div1, t1);
    			if (if_block1) if_block1.m(div1, null);
    			append(div1, t2);
    			append(div1, div0);

    			if (inner_start_slot) {
    				inner_start_slot.m(div0, null);
    			}

    			append(div0, t3);
    			if_blocks[current_block_type_index].m(div0, null);
    			append(div0, t4);

    			if (inner_end_slot) {
    				inner_end_slot.m(div0, null);
    			}

    			/*div0_binding*/ ctx[92](div0);
    			append(div1, t5);

    			if (content_slot) {
    				content_slot.m(div1, null);
    			}

    			append(div1, t6);

    			if (content_end_slot) {
    				content_end_slot.m(div1, null);
    			}

    			/*a_binding*/ ctx[93](a);
    			current = true;
    			if (remount) dispose();
    			dispose = listen(a, "click", /*onClick*/ ctx[43]);
    		},
    		p(ctx, dirty) {
    			if (content_start_slot) {
    				if (content_start_slot.p && dirty[3] & /*$$scope*/ 1024) {
    					content_start_slot.p(get_slot_context(content_start_slot_template, ctx, /*$$scope*/ ctx[103], get_content_start_slot_context), get_slot_changes(content_start_slot_template, /*$$scope*/ ctx[103], dirty, get_content_start_slot_changes));
    				}
    			}

    			if (/*isSortable*/ ctx[28] && /*sortable*/ ctx[12] !== false && /*isSortableOpposite*/ ctx[29]) {
    				if (if_block0) ; else {
    					if_block0 = create_if_block_25();
    					if_block0.c();
    					if_block0.m(div1, t1);
    				}
    			} else if (if_block0) {
    				if_block0.d(1);
    				if_block0 = null;
    			}

    			if (/*hasMedia*/ ctx[36]) {
    				if (if_block1) {
    					if_block1.p(ctx, dirty);

    					if (dirty[1] & /*hasMedia*/ 32) {
    						transition_in(if_block1, 1);
    					}
    				} else {
    					if_block1 = create_if_block_23(ctx);
    					if_block1.c();
    					transition_in(if_block1, 1);
    					if_block1.m(div1, t2);
    				}
    			} else if (if_block1) {
    				group_outros();

    				transition_out(if_block1, 1, 1, () => {
    					if_block1 = null;
    				});

    				check_outros();
    			}

    			if (inner_start_slot) {
    				if (inner_start_slot.p && dirty[3] & /*$$scope*/ 1024) {
    					inner_start_slot.p(get_slot_context(inner_start_slot_template, ctx, /*$$scope*/ ctx[103], get_inner_start_slot_context), get_slot_changes(inner_start_slot_template, /*$$scope*/ ctx[103], dirty, get_inner_start_slot_changes));
    				}
    			}

    			let previous_block_index = current_block_type_index;
    			current_block_type_index = select_block_type_3(ctx);

    			if (current_block_type_index === previous_block_index) {
    				if_blocks[current_block_type_index].p(ctx, dirty);
    			} else {
    				group_outros();

    				transition_out(if_blocks[previous_block_index], 1, 1, () => {
    					if_blocks[previous_block_index] = null;
    				});

    				check_outros();
    				if_block2 = if_blocks[current_block_type_index];

    				if (!if_block2) {
    					if_block2 = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);
    					if_block2.c();
    				}

    				transition_in(if_block2, 1);
    				if_block2.m(div0, t4);
    			}

    			if (inner_end_slot) {
    				if (inner_end_slot.p && dirty[3] & /*$$scope*/ 1024) {
    					inner_end_slot.p(get_slot_context(inner_end_slot_template, ctx, /*$$scope*/ ctx[103], get_inner_end_slot_context), get_slot_changes(inner_end_slot_template, /*$$scope*/ ctx[103], dirty, get_inner_end_slot_changes));
    				}
    			}

    			if (content_slot) {
    				if (content_slot.p && dirty[3] & /*$$scope*/ 1024) {
    					content_slot.p(get_slot_context(content_slot_template, ctx, /*$$scope*/ ctx[103], get_content_slot_context$1), get_slot_changes(content_slot_template, /*$$scope*/ ctx[103], dirty, get_content_slot_changes$1));
    				}
    			}

    			if (content_end_slot) {
    				if (content_end_slot.p && dirty[3] & /*$$scope*/ 1024) {
    					content_end_slot.p(get_slot_context(content_end_slot_template, ctx, /*$$scope*/ ctx[103], get_content_end_slot_context), get_slot_changes(content_end_slot_template, /*$$scope*/ ctx[103], dirty, get_content_end_slot_changes));
    				}
    			}

    			if (!current || dirty[1] & /*contentClasses*/ 2) {
    				attr(div1, "class", /*contentClasses*/ ctx[32]);
    			}

    			set_attributes(a, get_spread_update(a_levels, [
    				dirty[1] & /*linkClasses*/ 4 && { class: /*linkClasses*/ ctx[33] },
    				dirty[1] & /*linkAttrs*/ 8 && /*linkAttrs*/ ctx[34]
    			]));
    		},
    		i(local) {
    			if (current) return;
    			transition_in(content_start_slot, local);
    			transition_in(if_block1);
    			transition_in(inner_start_slot, local);
    			transition_in(if_block2);
    			transition_in(inner_end_slot, local);
    			transition_in(content_slot, local);
    			transition_in(content_end_slot, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(content_start_slot, local);
    			transition_out(if_block1);
    			transition_out(inner_start_slot, local);
    			transition_out(if_block2);
    			transition_out(inner_end_slot, local);
    			transition_out(content_slot, local);
    			transition_out(content_end_slot, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(a);
    			if (content_start_slot) content_start_slot.d(detaching);
    			if (if_block0) if_block0.d();
    			if (if_block1) if_block1.d();
    			if (inner_start_slot) inner_start_slot.d(detaching);
    			if_blocks[current_block_type_index].d();
    			if (inner_end_slot) inner_end_slot.d(detaching);
    			/*div0_binding*/ ctx[92](null);
    			if (content_slot) content_slot.d(detaching);
    			if (content_end_slot) content_end_slot.d(detaching);
    			/*a_binding*/ ctx[93](null);
    			dispose();
    		}
    	};
    }

    // (617:10) {:else}
    function create_else_block_4(ctx) {
    	let div1;
    	let t0;
    	let t1;
    	let t2;
    	let div0;
    	let t3;
    	let current_block_type_index;
    	let if_block2;
    	let t4;
    	let t5;
    	let t6;
    	let current;
    	let dispose;
    	const content_start_slot_template = /*$$slots*/ ctx[89]["content-start"];
    	const content_start_slot = create_slot(content_start_slot_template, ctx, /*$$scope*/ ctx[103], get_content_start_slot_context_2);
    	let if_block0 = /*isSortable*/ ctx[28] && /*sortable*/ ctx[12] !== false && /*isSortableOpposite*/ ctx[29] && create_if_block_66();
    	let if_block1 = /*hasMedia*/ ctx[36] && create_if_block_64(ctx);
    	const inner_start_slot_template = /*$$slots*/ ctx[89]["inner-start"];
    	const inner_start_slot = create_slot(inner_start_slot_template, ctx, /*$$scope*/ ctx[103], get_inner_start_slot_context_2);
    	const if_block_creators = [create_if_block_47, create_else_block_5];
    	const if_blocks = [];

    	function select_block_type_6(ctx, dirty) {
    		if (/*isMedia*/ ctx[27]) return 0;
    		return 1;
    	}

    	current_block_type_index = select_block_type_6(ctx);
    	if_block2 = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);
    	const inner_end_slot_template = /*$$slots*/ ctx[89]["inner-end"];
    	const inner_end_slot = create_slot(inner_end_slot_template, ctx, /*$$scope*/ ctx[103], get_inner_end_slot_context_2);
    	const content_slot_template = /*$$slots*/ ctx[89].content;
    	const content_slot = create_slot(content_slot_template, ctx, /*$$scope*/ ctx[103], get_content_slot_context_2);
    	const content_end_slot_template = /*$$slots*/ ctx[89]["content-end"];
    	const content_end_slot = create_slot(content_end_slot_template, ctx, /*$$scope*/ ctx[103], get_content_end_slot_context_2);

    	return {
    		c() {
    			div1 = element("div");
    			if (content_start_slot) content_start_slot.c();
    			t0 = space();
    			if (if_block0) if_block0.c();
    			t1 = space();
    			if (if_block1) if_block1.c();
    			t2 = space();
    			div0 = element("div");
    			if (inner_start_slot) inner_start_slot.c();
    			t3 = space();
    			if_block2.c();
    			t4 = space();
    			if (inner_end_slot) inner_end_slot.c();
    			t5 = space();
    			if (content_slot) content_slot.c();
    			t6 = space();
    			if (content_end_slot) content_end_slot.c();
    			attr(div0, "class", "item-inner");
    			attr(div1, "class", /*contentClasses*/ ctx[32]);
    		},
    		m(target, anchor, remount) {
    			insert(target, div1, anchor);

    			if (content_start_slot) {
    				content_start_slot.m(div1, null);
    			}

    			append(div1, t0);
    			if (if_block0) if_block0.m(div1, null);
    			append(div1, t1);
    			if (if_block1) if_block1.m(div1, null);
    			append(div1, t2);
    			append(div1, div0);

    			if (inner_start_slot) {
    				inner_start_slot.m(div0, null);
    			}

    			append(div0, t3);
    			if_blocks[current_block_type_index].m(div0, null);
    			append(div0, t4);

    			if (inner_end_slot) {
    				inner_end_slot.m(div0, null);
    			}

    			/*div0_binding_1*/ ctx[96](div0);
    			append(div1, t5);

    			if (content_slot) {
    				content_slot.m(div1, null);
    			}

    			append(div1, t6);

    			if (content_end_slot) {
    				content_end_slot.m(div1, null);
    			}

    			current = true;
    			if (remount) dispose();
    			dispose = listen(div1, "click", /*onClick*/ ctx[43]);
    		},
    		p(ctx, dirty) {
    			if (content_start_slot) {
    				if (content_start_slot.p && dirty[3] & /*$$scope*/ 1024) {
    					content_start_slot.p(get_slot_context(content_start_slot_template, ctx, /*$$scope*/ ctx[103], get_content_start_slot_context_2), get_slot_changes(content_start_slot_template, /*$$scope*/ ctx[103], dirty, get_content_start_slot_changes_2));
    				}
    			}

    			if (/*isSortable*/ ctx[28] && /*sortable*/ ctx[12] !== false && /*isSortableOpposite*/ ctx[29]) {
    				if (if_block0) ; else {
    					if_block0 = create_if_block_66();
    					if_block0.c();
    					if_block0.m(div1, t1);
    				}
    			} else if (if_block0) {
    				if_block0.d(1);
    				if_block0 = null;
    			}

    			if (/*hasMedia*/ ctx[36]) {
    				if (if_block1) {
    					if_block1.p(ctx, dirty);

    					if (dirty[1] & /*hasMedia*/ 32) {
    						transition_in(if_block1, 1);
    					}
    				} else {
    					if_block1 = create_if_block_64(ctx);
    					if_block1.c();
    					transition_in(if_block1, 1);
    					if_block1.m(div1, t2);
    				}
    			} else if (if_block1) {
    				group_outros();

    				transition_out(if_block1, 1, 1, () => {
    					if_block1 = null;
    				});

    				check_outros();
    			}

    			if (inner_start_slot) {
    				if (inner_start_slot.p && dirty[3] & /*$$scope*/ 1024) {
    					inner_start_slot.p(get_slot_context(inner_start_slot_template, ctx, /*$$scope*/ ctx[103], get_inner_start_slot_context_2), get_slot_changes(inner_start_slot_template, /*$$scope*/ ctx[103], dirty, get_inner_start_slot_changes_2));
    				}
    			}

    			let previous_block_index = current_block_type_index;
    			current_block_type_index = select_block_type_6(ctx);

    			if (current_block_type_index === previous_block_index) {
    				if_blocks[current_block_type_index].p(ctx, dirty);
    			} else {
    				group_outros();

    				transition_out(if_blocks[previous_block_index], 1, 1, () => {
    					if_blocks[previous_block_index] = null;
    				});

    				check_outros();
    				if_block2 = if_blocks[current_block_type_index];

    				if (!if_block2) {
    					if_block2 = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);
    					if_block2.c();
    				}

    				transition_in(if_block2, 1);
    				if_block2.m(div0, t4);
    			}

    			if (inner_end_slot) {
    				if (inner_end_slot.p && dirty[3] & /*$$scope*/ 1024) {
    					inner_end_slot.p(get_slot_context(inner_end_slot_template, ctx, /*$$scope*/ ctx[103], get_inner_end_slot_context_2), get_slot_changes(inner_end_slot_template, /*$$scope*/ ctx[103], dirty, get_inner_end_slot_changes_2));
    				}
    			}

    			if (content_slot) {
    				if (content_slot.p && dirty[3] & /*$$scope*/ 1024) {
    					content_slot.p(get_slot_context(content_slot_template, ctx, /*$$scope*/ ctx[103], get_content_slot_context_2), get_slot_changes(content_slot_template, /*$$scope*/ ctx[103], dirty, get_content_slot_changes_2));
    				}
    			}

    			if (content_end_slot) {
    				if (content_end_slot.p && dirty[3] & /*$$scope*/ 1024) {
    					content_end_slot.p(get_slot_context(content_end_slot_template, ctx, /*$$scope*/ ctx[103], get_content_end_slot_context_2), get_slot_changes(content_end_slot_template, /*$$scope*/ ctx[103], dirty, get_content_end_slot_changes_2));
    				}
    			}

    			if (!current || dirty[1] & /*contentClasses*/ 2) {
    				attr(div1, "class", /*contentClasses*/ ctx[32]);
    			}
    		},
    		i(local) {
    			if (current) return;
    			transition_in(content_start_slot, local);
    			transition_in(if_block1);
    			transition_in(inner_start_slot, local);
    			transition_in(if_block2);
    			transition_in(inner_end_slot, local);
    			transition_in(content_slot, local);
    			transition_in(content_end_slot, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(content_start_slot, local);
    			transition_out(if_block1);
    			transition_out(inner_start_slot, local);
    			transition_out(if_block2);
    			transition_out(inner_end_slot, local);
    			transition_out(content_slot, local);
    			transition_out(content_end_slot, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(div1);
    			if (content_start_slot) content_start_slot.d(detaching);
    			if (if_block0) if_block0.d();
    			if (if_block1) if_block1.d();
    			if (inner_start_slot) inner_start_slot.d(detaching);
    			if_blocks[current_block_type_index].d();
    			if (inner_end_slot) inner_end_slot.d(detaching);
    			/*div0_binding_1*/ ctx[96](null);
    			if (content_slot) content_slot.d(detaching);
    			if (content_end_slot) content_end_slot.d(detaching);
    			dispose();
    		}
    	};
    }

    // (493:10) {#if checkbox || radio}
    function create_if_block_26(ctx) {
    	let label;
    	let t0;
    	let t1;
    	let input;
    	let input_value_value;
    	let input_type_value;
    	let t2;
    	let i;
    	let i_class_value;
    	let t3;
    	let t4;
    	let div;
    	let t5;
    	let current_block_type_index;
    	let if_block2;
    	let t6;
    	let t7;
    	let t8;
    	let current;
    	let dispose;
    	const content_start_slot_template = /*$$slots*/ ctx[89]["content-start"];
    	const content_start_slot = create_slot(content_start_slot_template, ctx, /*$$scope*/ ctx[103], get_content_start_slot_context_1);
    	let if_block0 = /*isSortable*/ ctx[28] && /*sortable*/ ctx[12] !== false && /*isSortableOpposite*/ ctx[29] && create_if_block_46();
    	let if_block1 = /*hasMedia*/ ctx[36] && create_if_block_44(ctx);
    	const inner_start_slot_template = /*$$slots*/ ctx[89]["inner-start"];
    	const inner_start_slot = create_slot(inner_start_slot_template, ctx, /*$$scope*/ ctx[103], get_inner_start_slot_context_1);
    	const if_block_creators = [create_if_block_27, create_else_block_3];
    	const if_blocks = [];

    	function select_block_type_5(ctx, dirty) {
    		if (/*isMedia*/ ctx[27]) return 0;
    		return 1;
    	}

    	current_block_type_index = select_block_type_5(ctx);
    	if_block2 = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);
    	const inner_end_slot_template = /*$$slots*/ ctx[89]["inner-end"];
    	const inner_end_slot = create_slot(inner_end_slot_template, ctx, /*$$scope*/ ctx[103], get_inner_end_slot_context_1);
    	const content_slot_template = /*$$slots*/ ctx[89].content;
    	const content_slot = create_slot(content_slot_template, ctx, /*$$scope*/ ctx[103], get_content_slot_context_1);
    	const content_end_slot_template = /*$$slots*/ ctx[89]["content-end"];
    	const content_end_slot = create_slot(content_end_slot_template, ctx, /*$$scope*/ ctx[103], get_content_end_slot_context_1);

    	return {
    		c() {
    			label = element("label");
    			if (content_start_slot) content_start_slot.c();
    			t0 = space();
    			if (if_block0) if_block0.c();
    			t1 = space();
    			input = element("input");
    			t2 = space();
    			i = element("i");
    			t3 = space();
    			if (if_block1) if_block1.c();
    			t4 = space();
    			div = element("div");
    			if (inner_start_slot) inner_start_slot.c();
    			t5 = space();
    			if_block2.c();
    			t6 = space();
    			if (inner_end_slot) inner_end_slot.c();
    			t7 = space();
    			if (content_slot) content_slot.c();
    			t8 = space();
    			if (content_end_slot) content_end_slot.c();

    			input.value = input_value_value = typeof /*value*/ ctx[18] === "undefined"
    			? ""
    			: /*value*/ ctx[18];

    			attr(input, "name", /*name*/ ctx[17]);
    			input.checked = /*checked*/ ctx[16];
    			input.readOnly = /*readonly*/ ctx[19];
    			input.disabled = /*disabled*/ ctx[21];
    			input.required = /*required*/ ctx[20];
    			attr(input, "type", input_type_value = /*radio*/ ctx[15] ? "radio" : "checkbox");
    			attr(i, "class", i_class_value = `icon icon-${/*radio*/ ctx[15] ? "radio" : "checkbox"}`);
    			attr(div, "class", "item-inner");
    			attr(label, "class", /*contentClasses*/ ctx[32]);
    		},
    		m(target, anchor, remount) {
    			insert(target, label, anchor);

    			if (content_start_slot) {
    				content_start_slot.m(label, null);
    			}

    			append(label, t0);
    			if (if_block0) if_block0.m(label, null);
    			append(label, t1);
    			append(label, input);
    			/*input_binding*/ ctx[94](input);
    			append(label, t2);
    			append(label, i);
    			append(label, t3);
    			if (if_block1) if_block1.m(label, null);
    			append(label, t4);
    			append(label, div);

    			if (inner_start_slot) {
    				inner_start_slot.m(div, null);
    			}

    			append(div, t5);
    			if_blocks[current_block_type_index].m(div, null);
    			append(div, t6);

    			if (inner_end_slot) {
    				inner_end_slot.m(div, null);
    			}

    			/*div_binding*/ ctx[95](div);
    			append(label, t7);

    			if (content_slot) {
    				content_slot.m(label, null);
    			}

    			append(label, t8);

    			if (content_end_slot) {
    				content_end_slot.m(label, null);
    			}

    			current = true;
    			if (remount) run_all(dispose);

    			dispose = [
    				listen(input, "change", /*onChange*/ ctx[44]),
    				listen(label, "click", /*onClick*/ ctx[43])
    			];
    		},
    		p(ctx, dirty) {
    			if (content_start_slot) {
    				if (content_start_slot.p && dirty[3] & /*$$scope*/ 1024) {
    					content_start_slot.p(get_slot_context(content_start_slot_template, ctx, /*$$scope*/ ctx[103], get_content_start_slot_context_1), get_slot_changes(content_start_slot_template, /*$$scope*/ ctx[103], dirty, get_content_start_slot_changes_1));
    				}
    			}

    			if (/*isSortable*/ ctx[28] && /*sortable*/ ctx[12] !== false && /*isSortableOpposite*/ ctx[29]) {
    				if (if_block0) ; else {
    					if_block0 = create_if_block_46();
    					if_block0.c();
    					if_block0.m(label, t1);
    				}
    			} else if (if_block0) {
    				if_block0.d(1);
    				if_block0 = null;
    			}

    			if (!current || dirty[0] & /*value*/ 262144 && input_value_value !== (input_value_value = typeof /*value*/ ctx[18] === "undefined"
    			? ""
    			: /*value*/ ctx[18]) && input.value !== input_value_value) {
    				input.value = input_value_value;
    			}

    			if (!current || dirty[0] & /*name*/ 131072) {
    				attr(input, "name", /*name*/ ctx[17]);
    			}

    			if (!current || dirty[0] & /*checked*/ 65536) {
    				input.checked = /*checked*/ ctx[16];
    			}

    			if (!current || dirty[0] & /*readonly*/ 524288) {
    				input.readOnly = /*readonly*/ ctx[19];
    			}

    			if (!current || dirty[0] & /*disabled*/ 2097152) {
    				input.disabled = /*disabled*/ ctx[21];
    			}

    			if (!current || dirty[0] & /*required*/ 1048576) {
    				input.required = /*required*/ ctx[20];
    			}

    			if (!current || dirty[0] & /*radio*/ 32768 && input_type_value !== (input_type_value = /*radio*/ ctx[15] ? "radio" : "checkbox")) {
    				attr(input, "type", input_type_value);
    			}

    			if (!current || dirty[0] & /*radio*/ 32768 && i_class_value !== (i_class_value = `icon icon-${/*radio*/ ctx[15] ? "radio" : "checkbox"}`)) {
    				attr(i, "class", i_class_value);
    			}

    			if (/*hasMedia*/ ctx[36]) {
    				if (if_block1) {
    					if_block1.p(ctx, dirty);

    					if (dirty[1] & /*hasMedia*/ 32) {
    						transition_in(if_block1, 1);
    					}
    				} else {
    					if_block1 = create_if_block_44(ctx);
    					if_block1.c();
    					transition_in(if_block1, 1);
    					if_block1.m(label, t4);
    				}
    			} else if (if_block1) {
    				group_outros();

    				transition_out(if_block1, 1, 1, () => {
    					if_block1 = null;
    				});

    				check_outros();
    			}

    			if (inner_start_slot) {
    				if (inner_start_slot.p && dirty[3] & /*$$scope*/ 1024) {
    					inner_start_slot.p(get_slot_context(inner_start_slot_template, ctx, /*$$scope*/ ctx[103], get_inner_start_slot_context_1), get_slot_changes(inner_start_slot_template, /*$$scope*/ ctx[103], dirty, get_inner_start_slot_changes_1));
    				}
    			}

    			let previous_block_index = current_block_type_index;
    			current_block_type_index = select_block_type_5(ctx);

    			if (current_block_type_index === previous_block_index) {
    				if_blocks[current_block_type_index].p(ctx, dirty);
    			} else {
    				group_outros();

    				transition_out(if_blocks[previous_block_index], 1, 1, () => {
    					if_blocks[previous_block_index] = null;
    				});

    				check_outros();
    				if_block2 = if_blocks[current_block_type_index];

    				if (!if_block2) {
    					if_block2 = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);
    					if_block2.c();
    				}

    				transition_in(if_block2, 1);
    				if_block2.m(div, t6);
    			}

    			if (inner_end_slot) {
    				if (inner_end_slot.p && dirty[3] & /*$$scope*/ 1024) {
    					inner_end_slot.p(get_slot_context(inner_end_slot_template, ctx, /*$$scope*/ ctx[103], get_inner_end_slot_context_1), get_slot_changes(inner_end_slot_template, /*$$scope*/ ctx[103], dirty, get_inner_end_slot_changes_1));
    				}
    			}

    			if (content_slot) {
    				if (content_slot.p && dirty[3] & /*$$scope*/ 1024) {
    					content_slot.p(get_slot_context(content_slot_template, ctx, /*$$scope*/ ctx[103], get_content_slot_context_1), get_slot_changes(content_slot_template, /*$$scope*/ ctx[103], dirty, get_content_slot_changes_1));
    				}
    			}

    			if (content_end_slot) {
    				if (content_end_slot.p && dirty[3] & /*$$scope*/ 1024) {
    					content_end_slot.p(get_slot_context(content_end_slot_template, ctx, /*$$scope*/ ctx[103], get_content_end_slot_context_1), get_slot_changes(content_end_slot_template, /*$$scope*/ ctx[103], dirty, get_content_end_slot_changes_1));
    				}
    			}

    			if (!current || dirty[1] & /*contentClasses*/ 2) {
    				attr(label, "class", /*contentClasses*/ ctx[32]);
    			}
    		},
    		i(local) {
    			if (current) return;
    			transition_in(content_start_slot, local);
    			transition_in(if_block1);
    			transition_in(inner_start_slot, local);
    			transition_in(if_block2);
    			transition_in(inner_end_slot, local);
    			transition_in(content_slot, local);
    			transition_in(content_end_slot, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(content_start_slot, local);
    			transition_out(if_block1);
    			transition_out(inner_start_slot, local);
    			transition_out(if_block2);
    			transition_out(inner_end_slot, local);
    			transition_out(content_slot, local);
    			transition_out(content_end_slot, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(label);
    			if (content_start_slot) content_start_slot.d(detaching);
    			if (if_block0) if_block0.d();
    			/*input_binding*/ ctx[94](null);
    			if (if_block1) if_block1.d();
    			if (inner_start_slot) inner_start_slot.d(detaching);
    			if_blocks[current_block_type_index].d();
    			if (inner_end_slot) inner_end_slot.d(detaching);
    			/*div_binding*/ ctx[95](null);
    			if (content_slot) content_slot.d(detaching);
    			if (content_end_slot) content_end_slot.d(detaching);
    			run_all(dispose);
    		}
    	};
    }

    // (620:14) {#if isSortable && sortable !== false && isSortableOpposite}
    function create_if_block_66(ctx) {
    	let div;

    	return {
    		c() {
    			div = element("div");
    			attr(div, "class", "sortable-handler");
    		},
    		m(target, anchor) {
    			insert(target, div, anchor);
    		},
    		d(detaching) {
    			if (detaching) detach(div);
    		}
    	};
    }

    // (623:14) {#if hasMedia}
    function create_if_block_64(ctx) {
    	let div;
    	let t;
    	let current;
    	let if_block = typeof /*media*/ ctx[2] !== "undefined" && create_if_block_65(ctx);
    	const media_slot_template = /*$$slots*/ ctx[89].media;
    	const media_slot = create_slot(media_slot_template, ctx, /*$$scope*/ ctx[103], get_media_slot_context_2);

    	return {
    		c() {
    			div = element("div");
    			if (if_block) if_block.c();
    			t = space();
    			if (media_slot) media_slot.c();
    			attr(div, "class", "item-media");
    		},
    		m(target, anchor) {
    			insert(target, div, anchor);
    			if (if_block) if_block.m(div, null);
    			append(div, t);

    			if (media_slot) {
    				media_slot.m(div, null);
    			}

    			current = true;
    		},
    		p(ctx, dirty) {
    			if (typeof /*media*/ ctx[2] !== "undefined") {
    				if (if_block) {
    					if_block.p(ctx, dirty);
    				} else {
    					if_block = create_if_block_65(ctx);
    					if_block.c();
    					if_block.m(div, t);
    				}
    			} else if (if_block) {
    				if_block.d(1);
    				if_block = null;
    			}

    			if (media_slot) {
    				if (media_slot.p && dirty[3] & /*$$scope*/ 1024) {
    					media_slot.p(get_slot_context(media_slot_template, ctx, /*$$scope*/ ctx[103], get_media_slot_context_2), get_slot_changes(media_slot_template, /*$$scope*/ ctx[103], dirty, get_media_slot_changes_2));
    				}
    			}
    		},
    		i(local) {
    			if (current) return;
    			transition_in(media_slot, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(media_slot, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(div);
    			if (if_block) if_block.d();
    			if (media_slot) media_slot.d(detaching);
    		}
    	};
    }

    // (625:18) {#if typeof media !== 'undefined'}
    function create_if_block_65(ctx) {
    	let img;
    	let img_src_value;

    	return {
    		c() {
    			img = element("img");
    			if (img.src !== (img_src_value = /*media*/ ctx[2])) attr(img, "src", img_src_value);
    		},
    		m(target, anchor) {
    			insert(target, img, anchor);
    		},
    		p(ctx, dirty) {
    			if (dirty[0] & /*media*/ 4 && img.src !== (img_src_value = /*media*/ ctx[2])) {
    				attr(img, "src", img_src_value);
    			}
    		},
    		d(detaching) {
    			if (detaching) detach(img);
    		}
    	};
    }

    // (685:16) {:else}
    function create_else_block_5(ctx) {
    	let t0;
    	let t1;
    	let t2;
    	let t3;
    	let t4;
    	let if_block2_anchor;
    	let current;
    	const before_title_slot_template = /*$$slots*/ ctx[89]["before-title"];
    	const before_title_slot = create_slot(before_title_slot_template, ctx, /*$$scope*/ ctx[103], get_before_title_slot_context_5);
    	let if_block0 = (/*hasTitle*/ ctx[37] || /*hasHeader*/ ctx[38] || /*hasFooter*/ ctx[39]) && create_if_block_61(ctx);
    	const after_title_slot_template = /*$$slots*/ ctx[89]["after-title"];
    	const after_title_slot = create_slot(after_title_slot_template, ctx, /*$$scope*/ ctx[103], get_after_title_slot_context_5);
    	let if_block1 = /*hasAfter*/ ctx[42] && create_if_block_58(ctx);
    	const inner_slot_template = /*$$slots*/ ctx[89].inner;
    	const inner_slot = create_slot(inner_slot_template, ctx, /*$$scope*/ ctx[103], get_inner_slot_context_5);
    	let if_block2 = !(/*swipeout*/ ctx[11] || /*accordionItem*/ ctx[13]) && create_if_block_57(ctx);

    	return {
    		c() {
    			if (before_title_slot) before_title_slot.c();
    			t0 = space();
    			if (if_block0) if_block0.c();
    			t1 = space();
    			if (after_title_slot) after_title_slot.c();
    			t2 = space();
    			if (if_block1) if_block1.c();
    			t3 = space();
    			if (inner_slot) inner_slot.c();
    			t4 = space();
    			if (if_block2) if_block2.c();
    			if_block2_anchor = empty();
    		},
    		m(target, anchor) {
    			if (before_title_slot) {
    				before_title_slot.m(target, anchor);
    			}

    			insert(target, t0, anchor);
    			if (if_block0) if_block0.m(target, anchor);
    			insert(target, t1, anchor);

    			if (after_title_slot) {
    				after_title_slot.m(target, anchor);
    			}

    			insert(target, t2, anchor);
    			if (if_block1) if_block1.m(target, anchor);
    			insert(target, t3, anchor);

    			if (inner_slot) {
    				inner_slot.m(target, anchor);
    			}

    			insert(target, t4, anchor);
    			if (if_block2) if_block2.m(target, anchor);
    			insert(target, if_block2_anchor, anchor);
    			current = true;
    		},
    		p(ctx, dirty) {
    			if (before_title_slot) {
    				if (before_title_slot.p && dirty[3] & /*$$scope*/ 1024) {
    					before_title_slot.p(get_slot_context(before_title_slot_template, ctx, /*$$scope*/ ctx[103], get_before_title_slot_context_5), get_slot_changes(before_title_slot_template, /*$$scope*/ ctx[103], dirty, get_before_title_slot_changes_5));
    				}
    			}

    			if (/*hasTitle*/ ctx[37] || /*hasHeader*/ ctx[38] || /*hasFooter*/ ctx[39]) {
    				if (if_block0) {
    					if_block0.p(ctx, dirty);

    					if (dirty[1] & /*hasTitle, hasHeader, hasFooter*/ 448) {
    						transition_in(if_block0, 1);
    					}
    				} else {
    					if_block0 = create_if_block_61(ctx);
    					if_block0.c();
    					transition_in(if_block0, 1);
    					if_block0.m(t1.parentNode, t1);
    				}
    			} else if (if_block0) {
    				group_outros();

    				transition_out(if_block0, 1, 1, () => {
    					if_block0 = null;
    				});

    				check_outros();
    			}

    			if (after_title_slot) {
    				if (after_title_slot.p && dirty[3] & /*$$scope*/ 1024) {
    					after_title_slot.p(get_slot_context(after_title_slot_template, ctx, /*$$scope*/ ctx[103], get_after_title_slot_context_5), get_slot_changes(after_title_slot_template, /*$$scope*/ ctx[103], dirty, get_after_title_slot_changes_5));
    				}
    			}

    			if (/*hasAfter*/ ctx[42]) {
    				if (if_block1) {
    					if_block1.p(ctx, dirty);

    					if (dirty[1] & /*hasAfter*/ 2048) {
    						transition_in(if_block1, 1);
    					}
    				} else {
    					if_block1 = create_if_block_58(ctx);
    					if_block1.c();
    					transition_in(if_block1, 1);
    					if_block1.m(t3.parentNode, t3);
    				}
    			} else if (if_block1) {
    				group_outros();

    				transition_out(if_block1, 1, 1, () => {
    					if_block1 = null;
    				});

    				check_outros();
    			}

    			if (inner_slot) {
    				if (inner_slot.p && dirty[3] & /*$$scope*/ 1024) {
    					inner_slot.p(get_slot_context(inner_slot_template, ctx, /*$$scope*/ ctx[103], get_inner_slot_context_5), get_slot_changes(inner_slot_template, /*$$scope*/ ctx[103], dirty, get_inner_slot_changes_5));
    				}
    			}

    			if (!(/*swipeout*/ ctx[11] || /*accordionItem*/ ctx[13])) {
    				if (if_block2) {
    					if_block2.p(ctx, dirty);

    					if (dirty[0] & /*swipeout, accordionItem*/ 10240) {
    						transition_in(if_block2, 1);
    					}
    				} else {
    					if_block2 = create_if_block_57(ctx);
    					if_block2.c();
    					transition_in(if_block2, 1);
    					if_block2.m(if_block2_anchor.parentNode, if_block2_anchor);
    				}
    			} else if (if_block2) {
    				group_outros();

    				transition_out(if_block2, 1, 1, () => {
    					if_block2 = null;
    				});

    				check_outros();
    			}
    		},
    		i(local) {
    			if (current) return;
    			transition_in(before_title_slot, local);
    			transition_in(if_block0);
    			transition_in(after_title_slot, local);
    			transition_in(if_block1);
    			transition_in(inner_slot, local);
    			transition_in(if_block2);
    			current = true;
    		},
    		o(local) {
    			transition_out(before_title_slot, local);
    			transition_out(if_block0);
    			transition_out(after_title_slot, local);
    			transition_out(if_block1);
    			transition_out(inner_slot, local);
    			transition_out(if_block2);
    			current = false;
    		},
    		d(detaching) {
    			if (before_title_slot) before_title_slot.d(detaching);
    			if (detaching) detach(t0);
    			if (if_block0) if_block0.d(detaching);
    			if (detaching) detach(t1);
    			if (after_title_slot) after_title_slot.d(detaching);
    			if (detaching) detach(t2);
    			if (if_block1) if_block1.d(detaching);
    			if (detaching) detach(t3);
    			if (inner_slot) inner_slot.d(detaching);
    			if (detaching) detach(t4);
    			if (if_block2) if_block2.d(detaching);
    			if (detaching) detach(if_block2_anchor);
    		}
    	};
    }

    // (633:16) {#if isMedia}
    function create_if_block_47(ctx) {
    	let t0;
    	let div;
    	let t1;
    	let t2;
    	let t3;
    	let t4;
    	let t5;
    	let t6;
    	let t7;
    	let t8;
    	let if_block6_anchor;
    	let current;
    	let if_block0 = /*hasHeader*/ ctx[38] && create_if_block_56(ctx);
    	const before_title_slot_template = /*$$slots*/ ctx[89]["before-title"];
    	const before_title_slot = create_slot(before_title_slot_template, ctx, /*$$scope*/ ctx[103], get_before_title_slot_context_4);
    	let if_block1 = /*hasTitle*/ ctx[37] && create_if_block_55(ctx);
    	const after_title_slot_template = /*$$slots*/ ctx[89]["after-title"];
    	const after_title_slot = create_slot(after_title_slot_template, ctx, /*$$scope*/ ctx[103], get_after_title_slot_context_4);
    	let if_block2 = /*hasAfter*/ ctx[42] && create_if_block_52(ctx);
    	let if_block3 = /*hasSubtitle*/ ctx[40] && create_if_block_51(ctx);
    	let if_block4 = /*hasText*/ ctx[41] && create_if_block_50(ctx);
    	const inner_slot_template = /*$$slots*/ ctx[89].inner;
    	const inner_slot = create_slot(inner_slot_template, ctx, /*$$scope*/ ctx[103], get_inner_slot_context_4);
    	let if_block5 = !(/*swipeout*/ ctx[11] || /*accordionItem*/ ctx[13]) && create_if_block_49(ctx);
    	let if_block6 = /*hasFooter*/ ctx[39] && create_if_block_48(ctx);

    	return {
    		c() {
    			if (if_block0) if_block0.c();
    			t0 = space();
    			div = element("div");
    			if (before_title_slot) before_title_slot.c();
    			t1 = space();
    			if (if_block1) if_block1.c();
    			t2 = space();
    			if (after_title_slot) after_title_slot.c();
    			t3 = space();
    			if (if_block2) if_block2.c();
    			t4 = space();
    			if (if_block3) if_block3.c();
    			t5 = space();
    			if (if_block4) if_block4.c();
    			t6 = space();
    			if (inner_slot) inner_slot.c();
    			t7 = space();
    			if (if_block5) if_block5.c();
    			t8 = space();
    			if (if_block6) if_block6.c();
    			if_block6_anchor = empty();
    			attr(div, "class", "item-title-row");
    		},
    		m(target, anchor) {
    			if (if_block0) if_block0.m(target, anchor);
    			insert(target, t0, anchor);
    			insert(target, div, anchor);

    			if (before_title_slot) {
    				before_title_slot.m(div, null);
    			}

    			append(div, t1);
    			if (if_block1) if_block1.m(div, null);
    			append(div, t2);

    			if (after_title_slot) {
    				after_title_slot.m(div, null);
    			}

    			append(div, t3);
    			if (if_block2) if_block2.m(div, null);
    			insert(target, t4, anchor);
    			if (if_block3) if_block3.m(target, anchor);
    			insert(target, t5, anchor);
    			if (if_block4) if_block4.m(target, anchor);
    			insert(target, t6, anchor);

    			if (inner_slot) {
    				inner_slot.m(target, anchor);
    			}

    			insert(target, t7, anchor);
    			if (if_block5) if_block5.m(target, anchor);
    			insert(target, t8, anchor);
    			if (if_block6) if_block6.m(target, anchor);
    			insert(target, if_block6_anchor, anchor);
    			current = true;
    		},
    		p(ctx, dirty) {
    			if (/*hasHeader*/ ctx[38]) {
    				if (if_block0) {
    					if_block0.p(ctx, dirty);

    					if (dirty[1] & /*hasHeader*/ 128) {
    						transition_in(if_block0, 1);
    					}
    				} else {
    					if_block0 = create_if_block_56(ctx);
    					if_block0.c();
    					transition_in(if_block0, 1);
    					if_block0.m(t0.parentNode, t0);
    				}
    			} else if (if_block0) {
    				group_outros();

    				transition_out(if_block0, 1, 1, () => {
    					if_block0 = null;
    				});

    				check_outros();
    			}

    			if (before_title_slot) {
    				if (before_title_slot.p && dirty[3] & /*$$scope*/ 1024) {
    					before_title_slot.p(get_slot_context(before_title_slot_template, ctx, /*$$scope*/ ctx[103], get_before_title_slot_context_4), get_slot_changes(before_title_slot_template, /*$$scope*/ ctx[103], dirty, get_before_title_slot_changes_4));
    				}
    			}

    			if (/*hasTitle*/ ctx[37]) {
    				if (if_block1) {
    					if_block1.p(ctx, dirty);

    					if (dirty[1] & /*hasTitle*/ 64) {
    						transition_in(if_block1, 1);
    					}
    				} else {
    					if_block1 = create_if_block_55(ctx);
    					if_block1.c();
    					transition_in(if_block1, 1);
    					if_block1.m(div, t2);
    				}
    			} else if (if_block1) {
    				group_outros();

    				transition_out(if_block1, 1, 1, () => {
    					if_block1 = null;
    				});

    				check_outros();
    			}

    			if (after_title_slot) {
    				if (after_title_slot.p && dirty[3] & /*$$scope*/ 1024) {
    					after_title_slot.p(get_slot_context(after_title_slot_template, ctx, /*$$scope*/ ctx[103], get_after_title_slot_context_4), get_slot_changes(after_title_slot_template, /*$$scope*/ ctx[103], dirty, get_after_title_slot_changes_4));
    				}
    			}

    			if (/*hasAfter*/ ctx[42]) {
    				if (if_block2) {
    					if_block2.p(ctx, dirty);

    					if (dirty[1] & /*hasAfter*/ 2048) {
    						transition_in(if_block2, 1);
    					}
    				} else {
    					if_block2 = create_if_block_52(ctx);
    					if_block2.c();
    					transition_in(if_block2, 1);
    					if_block2.m(div, null);
    				}
    			} else if (if_block2) {
    				group_outros();

    				transition_out(if_block2, 1, 1, () => {
    					if_block2 = null;
    				});

    				check_outros();
    			}

    			if (/*hasSubtitle*/ ctx[40]) {
    				if (if_block3) {
    					if_block3.p(ctx, dirty);

    					if (dirty[1] & /*hasSubtitle*/ 512) {
    						transition_in(if_block3, 1);
    					}
    				} else {
    					if_block3 = create_if_block_51(ctx);
    					if_block3.c();
    					transition_in(if_block3, 1);
    					if_block3.m(t5.parentNode, t5);
    				}
    			} else if (if_block3) {
    				group_outros();

    				transition_out(if_block3, 1, 1, () => {
    					if_block3 = null;
    				});

    				check_outros();
    			}

    			if (/*hasText*/ ctx[41]) {
    				if (if_block4) {
    					if_block4.p(ctx, dirty);

    					if (dirty[1] & /*hasText*/ 1024) {
    						transition_in(if_block4, 1);
    					}
    				} else {
    					if_block4 = create_if_block_50(ctx);
    					if_block4.c();
    					transition_in(if_block4, 1);
    					if_block4.m(t6.parentNode, t6);
    				}
    			} else if (if_block4) {
    				group_outros();

    				transition_out(if_block4, 1, 1, () => {
    					if_block4 = null;
    				});

    				check_outros();
    			}

    			if (inner_slot) {
    				if (inner_slot.p && dirty[3] & /*$$scope*/ 1024) {
    					inner_slot.p(get_slot_context(inner_slot_template, ctx, /*$$scope*/ ctx[103], get_inner_slot_context_4), get_slot_changes(inner_slot_template, /*$$scope*/ ctx[103], dirty, get_inner_slot_changes_4));
    				}
    			}

    			if (!(/*swipeout*/ ctx[11] || /*accordionItem*/ ctx[13])) {
    				if (if_block5) {
    					if_block5.p(ctx, dirty);

    					if (dirty[0] & /*swipeout, accordionItem*/ 10240) {
    						transition_in(if_block5, 1);
    					}
    				} else {
    					if_block5 = create_if_block_49(ctx);
    					if_block5.c();
    					transition_in(if_block5, 1);
    					if_block5.m(t8.parentNode, t8);
    				}
    			} else if (if_block5) {
    				group_outros();

    				transition_out(if_block5, 1, 1, () => {
    					if_block5 = null;
    				});

    				check_outros();
    			}

    			if (/*hasFooter*/ ctx[39]) {
    				if (if_block6) {
    					if_block6.p(ctx, dirty);

    					if (dirty[1] & /*hasFooter*/ 256) {
    						transition_in(if_block6, 1);
    					}
    				} else {
    					if_block6 = create_if_block_48(ctx);
    					if_block6.c();
    					transition_in(if_block6, 1);
    					if_block6.m(if_block6_anchor.parentNode, if_block6_anchor);
    				}
    			} else if (if_block6) {
    				group_outros();

    				transition_out(if_block6, 1, 1, () => {
    					if_block6 = null;
    				});

    				check_outros();
    			}
    		},
    		i(local) {
    			if (current) return;
    			transition_in(if_block0);
    			transition_in(before_title_slot, local);
    			transition_in(if_block1);
    			transition_in(after_title_slot, local);
    			transition_in(if_block2);
    			transition_in(if_block3);
    			transition_in(if_block4);
    			transition_in(inner_slot, local);
    			transition_in(if_block5);
    			transition_in(if_block6);
    			current = true;
    		},
    		o(local) {
    			transition_out(if_block0);
    			transition_out(before_title_slot, local);
    			transition_out(if_block1);
    			transition_out(after_title_slot, local);
    			transition_out(if_block2);
    			transition_out(if_block3);
    			transition_out(if_block4);
    			transition_out(inner_slot, local);
    			transition_out(if_block5);
    			transition_out(if_block6);
    			current = false;
    		},
    		d(detaching) {
    			if (if_block0) if_block0.d(detaching);
    			if (detaching) detach(t0);
    			if (detaching) detach(div);
    			if (before_title_slot) before_title_slot.d(detaching);
    			if (if_block1) if_block1.d();
    			if (after_title_slot) after_title_slot.d(detaching);
    			if (if_block2) if_block2.d();
    			if (detaching) detach(t4);
    			if (if_block3) if_block3.d(detaching);
    			if (detaching) detach(t5);
    			if (if_block4) if_block4.d(detaching);
    			if (detaching) detach(t6);
    			if (inner_slot) inner_slot.d(detaching);
    			if (detaching) detach(t7);
    			if (if_block5) if_block5.d(detaching);
    			if (detaching) detach(t8);
    			if (if_block6) if_block6.d(detaching);
    			if (detaching) detach(if_block6_anchor);
    		}
    	};
    }

    // (687:18) {#if (hasTitle || hasHeader || hasFooter)}
    function create_if_block_61(ctx) {
    	let div;
    	let t0;
    	let t1_value = Utils.text(/*title*/ ctx[0]) + "";
    	let t1;
    	let t2;
    	let t3;
    	let current;
    	let if_block0 = /*hasHeader*/ ctx[38] && create_if_block_63(ctx);
    	const title_slot_template = /*$$slots*/ ctx[89].title;
    	const title_slot = create_slot(title_slot_template, ctx, /*$$scope*/ ctx[103], get_title_slot_context_5);
    	let if_block1 = /*hasFooter*/ ctx[39] && create_if_block_62(ctx);

    	return {
    		c() {
    			div = element("div");
    			if (if_block0) if_block0.c();
    			t0 = space();
    			t1 = text(t1_value);
    			t2 = space();
    			if (title_slot) title_slot.c();
    			t3 = space();
    			if (if_block1) if_block1.c();
    			attr(div, "class", "item-title");
    		},
    		m(target, anchor) {
    			insert(target, div, anchor);
    			if (if_block0) if_block0.m(div, null);
    			append(div, t0);
    			append(div, t1);
    			append(div, t2);

    			if (title_slot) {
    				title_slot.m(div, null);
    			}

    			append(div, t3);
    			if (if_block1) if_block1.m(div, null);
    			current = true;
    		},
    		p(ctx, dirty) {
    			if (/*hasHeader*/ ctx[38]) {
    				if (if_block0) {
    					if_block0.p(ctx, dirty);

    					if (dirty[1] & /*hasHeader*/ 128) {
    						transition_in(if_block0, 1);
    					}
    				} else {
    					if_block0 = create_if_block_63(ctx);
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

    			if ((!current || dirty[0] & /*title*/ 1) && t1_value !== (t1_value = Utils.text(/*title*/ ctx[0]) + "")) set_data(t1, t1_value);

    			if (title_slot) {
    				if (title_slot.p && dirty[3] & /*$$scope*/ 1024) {
    					title_slot.p(get_slot_context(title_slot_template, ctx, /*$$scope*/ ctx[103], get_title_slot_context_5), get_slot_changes(title_slot_template, /*$$scope*/ ctx[103], dirty, get_title_slot_changes_5));
    				}
    			}

    			if (/*hasFooter*/ ctx[39]) {
    				if (if_block1) {
    					if_block1.p(ctx, dirty);

    					if (dirty[1] & /*hasFooter*/ 256) {
    						transition_in(if_block1, 1);
    					}
    				} else {
    					if_block1 = create_if_block_62(ctx);
    					if_block1.c();
    					transition_in(if_block1, 1);
    					if_block1.m(div, null);
    				}
    			} else if (if_block1) {
    				group_outros();

    				transition_out(if_block1, 1, 1, () => {
    					if_block1 = null;
    				});

    				check_outros();
    			}
    		},
    		i(local) {
    			if (current) return;
    			transition_in(if_block0);
    			transition_in(title_slot, local);
    			transition_in(if_block1);
    			current = true;
    		},
    		o(local) {
    			transition_out(if_block0);
    			transition_out(title_slot, local);
    			transition_out(if_block1);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(div);
    			if (if_block0) if_block0.d();
    			if (title_slot) title_slot.d(detaching);
    			if (if_block1) if_block1.d();
    		}
    	};
    }

    // (689:22) {#if hasHeader}
    function create_if_block_63(ctx) {
    	let div;
    	let t0_value = Utils.text(/*header*/ ctx[4]) + "";
    	let t0;
    	let t1;
    	let current;
    	const header_slot_template = /*$$slots*/ ctx[89].header;
    	const header_slot = create_slot(header_slot_template, ctx, /*$$scope*/ ctx[103], get_header_slot_context_5);

    	return {
    		c() {
    			div = element("div");
    			t0 = text(t0_value);
    			t1 = space();
    			if (header_slot) header_slot.c();
    			attr(div, "class", "item-header");
    		},
    		m(target, anchor) {
    			insert(target, div, anchor);
    			append(div, t0);
    			append(div, t1);

    			if (header_slot) {
    				header_slot.m(div, null);
    			}

    			current = true;
    		},
    		p(ctx, dirty) {
    			if ((!current || dirty[0] & /*header*/ 16) && t0_value !== (t0_value = Utils.text(/*header*/ ctx[4]) + "")) set_data(t0, t0_value);

    			if (header_slot) {
    				if (header_slot.p && dirty[3] & /*$$scope*/ 1024) {
    					header_slot.p(get_slot_context(header_slot_template, ctx, /*$$scope*/ ctx[103], get_header_slot_context_5), get_slot_changes(header_slot_template, /*$$scope*/ ctx[103], dirty, get_header_slot_changes_5));
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
    		}
    	};
    }

    // (697:22) {#if hasFooter}
    function create_if_block_62(ctx) {
    	let div;
    	let t0_value = Utils.text(/*footer*/ ctx[5]) + "";
    	let t0;
    	let t1;
    	let current;
    	const footer_slot_template = /*$$slots*/ ctx[89].footer;
    	const footer_slot = create_slot(footer_slot_template, ctx, /*$$scope*/ ctx[103], get_footer_slot_context_5);

    	return {
    		c() {
    			div = element("div");
    			t0 = text(t0_value);
    			t1 = space();
    			if (footer_slot) footer_slot.c();
    			attr(div, "class", "item-footer");
    		},
    		m(target, anchor) {
    			insert(target, div, anchor);
    			append(div, t0);
    			append(div, t1);

    			if (footer_slot) {
    				footer_slot.m(div, null);
    			}

    			current = true;
    		},
    		p(ctx, dirty) {
    			if ((!current || dirty[0] & /*footer*/ 32) && t0_value !== (t0_value = Utils.text(/*footer*/ ctx[5]) + "")) set_data(t0, t0_value);

    			if (footer_slot) {
    				if (footer_slot.p && dirty[3] & /*$$scope*/ 1024) {
    					footer_slot.p(get_slot_context(footer_slot_template, ctx, /*$$scope*/ ctx[103], get_footer_slot_context_5), get_slot_changes(footer_slot_template, /*$$scope*/ ctx[103], dirty, get_footer_slot_changes_5));
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
    		}
    	};
    }

    // (706:18) {#if hasAfter}
    function create_if_block_58(ctx) {
    	let div;
    	let t0;
    	let t1;
    	let t2;
    	let t3;
    	let current;
    	const after_start_slot_template = /*$$slots*/ ctx[89]["after-start"];
    	const after_start_slot = create_slot(after_start_slot_template, ctx, /*$$scope*/ ctx[103], get_after_start_slot_context_5);
    	let if_block0 = typeof /*after*/ ctx[6] !== "undefined" && create_if_block_60(ctx);
    	let if_block1 = typeof /*badge*/ ctx[7] !== "undefined" && create_if_block_59(ctx);
    	const after_slot_template = /*$$slots*/ ctx[89].after;
    	const after_slot = create_slot(after_slot_template, ctx, /*$$scope*/ ctx[103], get_after_slot_context_5);
    	const after_end_slot_template = /*$$slots*/ ctx[89]["after-end"];
    	const after_end_slot = create_slot(after_end_slot_template, ctx, /*$$scope*/ ctx[103], get_after_end_slot_context_5);

    	return {
    		c() {
    			div = element("div");
    			if (after_start_slot) after_start_slot.c();
    			t0 = space();
    			if (if_block0) if_block0.c();
    			t1 = space();
    			if (if_block1) if_block1.c();
    			t2 = space();
    			if (after_slot) after_slot.c();
    			t3 = space();
    			if (after_end_slot) after_end_slot.c();
    			attr(div, "class", "item-after");
    		},
    		m(target, anchor) {
    			insert(target, div, anchor);

    			if (after_start_slot) {
    				after_start_slot.m(div, null);
    			}

    			append(div, t0);
    			if (if_block0) if_block0.m(div, null);
    			append(div, t1);
    			if (if_block1) if_block1.m(div, null);
    			append(div, t2);

    			if (after_slot) {
    				after_slot.m(div, null);
    			}

    			append(div, t3);

    			if (after_end_slot) {
    				after_end_slot.m(div, null);
    			}

    			current = true;
    		},
    		p(ctx, dirty) {
    			if (after_start_slot) {
    				if (after_start_slot.p && dirty[3] & /*$$scope*/ 1024) {
    					after_start_slot.p(get_slot_context(after_start_slot_template, ctx, /*$$scope*/ ctx[103], get_after_start_slot_context_5), get_slot_changes(after_start_slot_template, /*$$scope*/ ctx[103], dirty, get_after_start_slot_changes_5));
    				}
    			}

    			if (typeof /*after*/ ctx[6] !== "undefined") {
    				if (if_block0) {
    					if_block0.p(ctx, dirty);
    				} else {
    					if_block0 = create_if_block_60(ctx);
    					if_block0.c();
    					if_block0.m(div, t1);
    				}
    			} else if (if_block0) {
    				if_block0.d(1);
    				if_block0 = null;
    			}

    			if (typeof /*badge*/ ctx[7] !== "undefined") {
    				if (if_block1) {
    					if_block1.p(ctx, dirty);

    					if (dirty[0] & /*badge*/ 128) {
    						transition_in(if_block1, 1);
    					}
    				} else {
    					if_block1 = create_if_block_59(ctx);
    					if_block1.c();
    					transition_in(if_block1, 1);
    					if_block1.m(div, t2);
    				}
    			} else if (if_block1) {
    				group_outros();

    				transition_out(if_block1, 1, 1, () => {
    					if_block1 = null;
    				});

    				check_outros();
    			}

    			if (after_slot) {
    				if (after_slot.p && dirty[3] & /*$$scope*/ 1024) {
    					after_slot.p(get_slot_context(after_slot_template, ctx, /*$$scope*/ ctx[103], get_after_slot_context_5), get_slot_changes(after_slot_template, /*$$scope*/ ctx[103], dirty, get_after_slot_changes_5));
    				}
    			}

    			if (after_end_slot) {
    				if (after_end_slot.p && dirty[3] & /*$$scope*/ 1024) {
    					after_end_slot.p(get_slot_context(after_end_slot_template, ctx, /*$$scope*/ ctx[103], get_after_end_slot_context_5), get_slot_changes(after_end_slot_template, /*$$scope*/ ctx[103], dirty, get_after_end_slot_changes_5));
    				}
    			}
    		},
    		i(local) {
    			if (current) return;
    			transition_in(after_start_slot, local);
    			transition_in(if_block1);
    			transition_in(after_slot, local);
    			transition_in(after_end_slot, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(after_start_slot, local);
    			transition_out(if_block1);
    			transition_out(after_slot, local);
    			transition_out(after_end_slot, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(div);
    			if (after_start_slot) after_start_slot.d(detaching);
    			if (if_block0) if_block0.d();
    			if (if_block1) if_block1.d();
    			if (after_slot) after_slot.d(detaching);
    			if (after_end_slot) after_end_slot.d(detaching);
    		}
    	};
    }

    // (709:22) {#if typeof after !== 'undefined'}
    function create_if_block_60(ctx) {
    	let span;
    	let t_value = Utils.text(/*after*/ ctx[6]) + "";
    	let t;

    	return {
    		c() {
    			span = element("span");
    			t = text(t_value);
    		},
    		m(target, anchor) {
    			insert(target, span, anchor);
    			append(span, t);
    		},
    		p(ctx, dirty) {
    			if (dirty[0] & /*after*/ 64 && t_value !== (t_value = Utils.text(/*after*/ ctx[6]) + "")) set_data(t, t_value);
    		},
    		d(detaching) {
    			if (detaching) detach(span);
    		}
    	};
    }

    // (712:22) {#if typeof badge !== 'undefined'}
    function create_if_block_59(ctx) {
    	let current;

    	const badge_1 = new Badge({
    			props: {
    				color: /*badgeColor*/ ctx[8],
    				$$slots: { default: [create_default_slot_5] },
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
    			if (dirty[0] & /*badgeColor*/ 256) badge_1_changes.color = /*badgeColor*/ ctx[8];

    			if (dirty[0] & /*badge*/ 128 | dirty[3] & /*$$scope*/ 1024) {
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

    // (713:24) <Badge color={badgeColor}>
    function create_default_slot_5(ctx) {
    	let t_value = Utils.text(/*badge*/ ctx[7]) + "";
    	let t;

    	return {
    		c() {
    			t = text(t_value);
    		},
    		m(target, anchor) {
    			insert(target, t, anchor);
    		},
    		p(ctx, dirty) {
    			if (dirty[0] & /*badge*/ 128 && t_value !== (t_value = Utils.text(/*badge*/ ctx[7]) + "")) set_data(t, t_value);
    		},
    		d(detaching) {
    			if (detaching) detach(t);
    		}
    	};
    }

    // (720:18) {#if !(swipeout || accordionItem)}
    function create_if_block_57(ctx) {
    	let current;
    	const default_slot_template = /*$$slots*/ ctx[89].default;
    	const default_slot = create_slot(default_slot_template, ctx, /*$$scope*/ ctx[103], null);

    	return {
    		c() {
    			if (default_slot) default_slot.c();
    		},
    		m(target, anchor) {
    			if (default_slot) {
    				default_slot.m(target, anchor);
    			}

    			current = true;
    		},
    		p(ctx, dirty) {
    			if (default_slot) {
    				if (default_slot.p && dirty[3] & /*$$scope*/ 1024) {
    					default_slot.p(get_slot_context(default_slot_template, ctx, /*$$scope*/ ctx[103], null), get_slot_changes(default_slot_template, /*$$scope*/ ctx[103], dirty, null));
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
    			if (default_slot) default_slot.d(detaching);
    		}
    	};
    }

    // (634:18) {#if hasHeader}
    function create_if_block_56(ctx) {
    	let div;
    	let t0_value = Utils.text(/*header*/ ctx[4]) + "";
    	let t0;
    	let t1;
    	let current;
    	const header_slot_template = /*$$slots*/ ctx[89].header;
    	const header_slot = create_slot(header_slot_template, ctx, /*$$scope*/ ctx[103], get_header_slot_context_4);

    	return {
    		c() {
    			div = element("div");
    			t0 = text(t0_value);
    			t1 = space();
    			if (header_slot) header_slot.c();
    			attr(div, "class", "item-header");
    		},
    		m(target, anchor) {
    			insert(target, div, anchor);
    			append(div, t0);
    			append(div, t1);

    			if (header_slot) {
    				header_slot.m(div, null);
    			}

    			current = true;
    		},
    		p(ctx, dirty) {
    			if ((!current || dirty[0] & /*header*/ 16) && t0_value !== (t0_value = Utils.text(/*header*/ ctx[4]) + "")) set_data(t0, t0_value);

    			if (header_slot) {
    				if (header_slot.p && dirty[3] & /*$$scope*/ 1024) {
    					header_slot.p(get_slot_context(header_slot_template, ctx, /*$$scope*/ ctx[103], get_header_slot_context_4), get_slot_changes(header_slot_template, /*$$scope*/ ctx[103], dirty, get_header_slot_changes_4));
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
    		}
    	};
    }

    // (642:20) {#if (hasTitle)}
    function create_if_block_55(ctx) {
    	let div;
    	let t0_value = Utils.text(/*title*/ ctx[0]) + "";
    	let t0;
    	let t1;
    	let current;
    	const title_slot_template = /*$$slots*/ ctx[89].title;
    	const title_slot = create_slot(title_slot_template, ctx, /*$$scope*/ ctx[103], get_title_slot_context_4);

    	return {
    		c() {
    			div = element("div");
    			t0 = text(t0_value);
    			t1 = space();
    			if (title_slot) title_slot.c();
    			attr(div, "class", "item-title");
    		},
    		m(target, anchor) {
    			insert(target, div, anchor);
    			append(div, t0);
    			append(div, t1);

    			if (title_slot) {
    				title_slot.m(div, null);
    			}

    			current = true;
    		},
    		p(ctx, dirty) {
    			if ((!current || dirty[0] & /*title*/ 1) && t0_value !== (t0_value = Utils.text(/*title*/ ctx[0]) + "")) set_data(t0, t0_value);

    			if (title_slot) {
    				if (title_slot.p && dirty[3] & /*$$scope*/ 1024) {
    					title_slot.p(get_slot_context(title_slot_template, ctx, /*$$scope*/ ctx[103], get_title_slot_context_4), get_slot_changes(title_slot_template, /*$$scope*/ ctx[103], dirty, get_title_slot_changes_4));
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
    			if (detaching) detach(div);
    			if (title_slot) title_slot.d(detaching);
    		}
    	};
    }

    // (649:20) {#if hasAfter}
    function create_if_block_52(ctx) {
    	let div;
    	let t0;
    	let t1;
    	let t2;
    	let t3;
    	let current;
    	const after_start_slot_template = /*$$slots*/ ctx[89]["after-start"];
    	const after_start_slot = create_slot(after_start_slot_template, ctx, /*$$scope*/ ctx[103], get_after_start_slot_context_4);
    	let if_block0 = typeof /*after*/ ctx[6] !== "undefined" && create_if_block_54(ctx);
    	let if_block1 = typeof /*badge*/ ctx[7] !== "undefined" && create_if_block_53(ctx);
    	const after_slot_template = /*$$slots*/ ctx[89].after;
    	const after_slot = create_slot(after_slot_template, ctx, /*$$scope*/ ctx[103], get_after_slot_context_4);
    	const after_end_slot_template = /*$$slots*/ ctx[89]["after-end"];
    	const after_end_slot = create_slot(after_end_slot_template, ctx, /*$$scope*/ ctx[103], get_after_end_slot_context_4);

    	return {
    		c() {
    			div = element("div");
    			if (after_start_slot) after_start_slot.c();
    			t0 = space();
    			if (if_block0) if_block0.c();
    			t1 = space();
    			if (if_block1) if_block1.c();
    			t2 = space();
    			if (after_slot) after_slot.c();
    			t3 = space();
    			if (after_end_slot) after_end_slot.c();
    			attr(div, "class", "item-after");
    		},
    		m(target, anchor) {
    			insert(target, div, anchor);

    			if (after_start_slot) {
    				after_start_slot.m(div, null);
    			}

    			append(div, t0);
    			if (if_block0) if_block0.m(div, null);
    			append(div, t1);
    			if (if_block1) if_block1.m(div, null);
    			append(div, t2);

    			if (after_slot) {
    				after_slot.m(div, null);
    			}

    			append(div, t3);

    			if (after_end_slot) {
    				after_end_slot.m(div, null);
    			}

    			current = true;
    		},
    		p(ctx, dirty) {
    			if (after_start_slot) {
    				if (after_start_slot.p && dirty[3] & /*$$scope*/ 1024) {
    					after_start_slot.p(get_slot_context(after_start_slot_template, ctx, /*$$scope*/ ctx[103], get_after_start_slot_context_4), get_slot_changes(after_start_slot_template, /*$$scope*/ ctx[103], dirty, get_after_start_slot_changes_4));
    				}
    			}

    			if (typeof /*after*/ ctx[6] !== "undefined") {
    				if (if_block0) {
    					if_block0.p(ctx, dirty);
    				} else {
    					if_block0 = create_if_block_54(ctx);
    					if_block0.c();
    					if_block0.m(div, t1);
    				}
    			} else if (if_block0) {
    				if_block0.d(1);
    				if_block0 = null;
    			}

    			if (typeof /*badge*/ ctx[7] !== "undefined") {
    				if (if_block1) {
    					if_block1.p(ctx, dirty);

    					if (dirty[0] & /*badge*/ 128) {
    						transition_in(if_block1, 1);
    					}
    				} else {
    					if_block1 = create_if_block_53(ctx);
    					if_block1.c();
    					transition_in(if_block1, 1);
    					if_block1.m(div, t2);
    				}
    			} else if (if_block1) {
    				group_outros();

    				transition_out(if_block1, 1, 1, () => {
    					if_block1 = null;
    				});

    				check_outros();
    			}

    			if (after_slot) {
    				if (after_slot.p && dirty[3] & /*$$scope*/ 1024) {
    					after_slot.p(get_slot_context(after_slot_template, ctx, /*$$scope*/ ctx[103], get_after_slot_context_4), get_slot_changes(after_slot_template, /*$$scope*/ ctx[103], dirty, get_after_slot_changes_4));
    				}
    			}

    			if (after_end_slot) {
    				if (after_end_slot.p && dirty[3] & /*$$scope*/ 1024) {
    					after_end_slot.p(get_slot_context(after_end_slot_template, ctx, /*$$scope*/ ctx[103], get_after_end_slot_context_4), get_slot_changes(after_end_slot_template, /*$$scope*/ ctx[103], dirty, get_after_end_slot_changes_4));
    				}
    			}
    		},
    		i(local) {
    			if (current) return;
    			transition_in(after_start_slot, local);
    			transition_in(if_block1);
    			transition_in(after_slot, local);
    			transition_in(after_end_slot, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(after_start_slot, local);
    			transition_out(if_block1);
    			transition_out(after_slot, local);
    			transition_out(after_end_slot, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(div);
    			if (after_start_slot) after_start_slot.d(detaching);
    			if (if_block0) if_block0.d();
    			if (if_block1) if_block1.d();
    			if (after_slot) after_slot.d(detaching);
    			if (after_end_slot) after_end_slot.d(detaching);
    		}
    	};
    }

    // (652:24) {#if typeof after !== 'undefined'}
    function create_if_block_54(ctx) {
    	let span;
    	let t_value = Utils.text(/*after*/ ctx[6]) + "";
    	let t;

    	return {
    		c() {
    			span = element("span");
    			t = text(t_value);
    		},
    		m(target, anchor) {
    			insert(target, span, anchor);
    			append(span, t);
    		},
    		p(ctx, dirty) {
    			if (dirty[0] & /*after*/ 64 && t_value !== (t_value = Utils.text(/*after*/ ctx[6]) + "")) set_data(t, t_value);
    		},
    		d(detaching) {
    			if (detaching) detach(span);
    		}
    	};
    }

    // (655:24) {#if typeof badge !== 'undefined'}
    function create_if_block_53(ctx) {
    	let current;

    	const badge_1 = new Badge({
    			props: {
    				color: /*badgeColor*/ ctx[8],
    				$$slots: { default: [create_default_slot_4] },
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
    			if (dirty[0] & /*badgeColor*/ 256) badge_1_changes.color = /*badgeColor*/ ctx[8];

    			if (dirty[0] & /*badge*/ 128 | dirty[3] & /*$$scope*/ 1024) {
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

    // (656:26) <Badge color={badgeColor}>
    function create_default_slot_4(ctx) {
    	let t_value = Utils.text(/*badge*/ ctx[7]) + "";
    	let t;

    	return {
    		c() {
    			t = text(t_value);
    		},
    		m(target, anchor) {
    			insert(target, t, anchor);
    		},
    		p(ctx, dirty) {
    			if (dirty[0] & /*badge*/ 128 && t_value !== (t_value = Utils.text(/*badge*/ ctx[7]) + "")) set_data(t, t_value);
    		},
    		d(detaching) {
    			if (detaching) detach(t);
    		}
    	};
    }

    // (663:18) {#if hasSubtitle}
    function create_if_block_51(ctx) {
    	let div;
    	let t0_value = Utils.text(/*subtitle*/ ctx[3]) + "";
    	let t0;
    	let t1;
    	let current;
    	const subtitle_slot_template = /*$$slots*/ ctx[89].subtitle;
    	const subtitle_slot = create_slot(subtitle_slot_template, ctx, /*$$scope*/ ctx[103], get_subtitle_slot_context_2);

    	return {
    		c() {
    			div = element("div");
    			t0 = text(t0_value);
    			t1 = space();
    			if (subtitle_slot) subtitle_slot.c();
    			attr(div, "class", "item-subtitle");
    		},
    		m(target, anchor) {
    			insert(target, div, anchor);
    			append(div, t0);
    			append(div, t1);

    			if (subtitle_slot) {
    				subtitle_slot.m(div, null);
    			}

    			current = true;
    		},
    		p(ctx, dirty) {
    			if ((!current || dirty[0] & /*subtitle*/ 8) && t0_value !== (t0_value = Utils.text(/*subtitle*/ ctx[3]) + "")) set_data(t0, t0_value);

    			if (subtitle_slot) {
    				if (subtitle_slot.p && dirty[3] & /*$$scope*/ 1024) {
    					subtitle_slot.p(get_slot_context(subtitle_slot_template, ctx, /*$$scope*/ ctx[103], get_subtitle_slot_context_2), get_slot_changes(subtitle_slot_template, /*$$scope*/ ctx[103], dirty, get_subtitle_slot_changes_2));
    				}
    			}
    		},
    		i(local) {
    			if (current) return;
    			transition_in(subtitle_slot, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(subtitle_slot, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(div);
    			if (subtitle_slot) subtitle_slot.d(detaching);
    		}
    	};
    }

    // (669:18) {#if hasText}
    function create_if_block_50(ctx) {
    	let div;
    	let t0_value = Utils.text(/*text*/ ctx[1]) + "";
    	let t0;
    	let t1;
    	let current;
    	const text_slot_template = /*$$slots*/ ctx[89].text;
    	const text_slot = create_slot(text_slot_template, ctx, /*$$scope*/ ctx[103], get_text_slot_context_2);

    	return {
    		c() {
    			div = element("div");
    			t0 = text(t0_value);
    			t1 = space();
    			if (text_slot) text_slot.c();
    			attr(div, "class", "item-text");
    		},
    		m(target, anchor) {
    			insert(target, div, anchor);
    			append(div, t0);
    			append(div, t1);

    			if (text_slot) {
    				text_slot.m(div, null);
    			}

    			current = true;
    		},
    		p(ctx, dirty) {
    			if ((!current || dirty[0] & /*text*/ 2) && t0_value !== (t0_value = Utils.text(/*text*/ ctx[1]) + "")) set_data(t0, t0_value);

    			if (text_slot) {
    				if (text_slot.p && dirty[3] & /*$$scope*/ 1024) {
    					text_slot.p(get_slot_context(text_slot_template, ctx, /*$$scope*/ ctx[103], get_text_slot_context_2), get_slot_changes(text_slot_template, /*$$scope*/ ctx[103], dirty, get_text_slot_changes_2));
    				}
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
    			if (text_slot) text_slot.d(detaching);
    		}
    	};
    }

    // (676:18) {#if !(swipeout || accordionItem)}
    function create_if_block_49(ctx) {
    	let current;
    	const default_slot_template = /*$$slots*/ ctx[89].default;
    	const default_slot = create_slot(default_slot_template, ctx, /*$$scope*/ ctx[103], null);

    	return {
    		c() {
    			if (default_slot) default_slot.c();
    		},
    		m(target, anchor) {
    			if (default_slot) {
    				default_slot.m(target, anchor);
    			}

    			current = true;
    		},
    		p(ctx, dirty) {
    			if (default_slot) {
    				if (default_slot.p && dirty[3] & /*$$scope*/ 1024) {
    					default_slot.p(get_slot_context(default_slot_template, ctx, /*$$scope*/ ctx[103], null), get_slot_changes(default_slot_template, /*$$scope*/ ctx[103], dirty, null));
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
    			if (default_slot) default_slot.d(detaching);
    		}
    	};
    }

    // (679:18) {#if hasFooter}
    function create_if_block_48(ctx) {
    	let div;
    	let t0_value = Utils.text(/*footer*/ ctx[5]) + "";
    	let t0;
    	let t1;
    	let current;
    	const footer_slot_template = /*$$slots*/ ctx[89].footer;
    	const footer_slot = create_slot(footer_slot_template, ctx, /*$$scope*/ ctx[103], get_footer_slot_context_4);

    	return {
    		c() {
    			div = element("div");
    			t0 = text(t0_value);
    			t1 = space();
    			if (footer_slot) footer_slot.c();
    			attr(div, "class", "item-footer");
    		},
    		m(target, anchor) {
    			insert(target, div, anchor);
    			append(div, t0);
    			append(div, t1);

    			if (footer_slot) {
    				footer_slot.m(div, null);
    			}

    			current = true;
    		},
    		p(ctx, dirty) {
    			if ((!current || dirty[0] & /*footer*/ 32) && t0_value !== (t0_value = Utils.text(/*footer*/ ctx[5]) + "")) set_data(t0, t0_value);

    			if (footer_slot) {
    				if (footer_slot.p && dirty[3] & /*$$scope*/ 1024) {
    					footer_slot.p(get_slot_context(footer_slot_template, ctx, /*$$scope*/ ctx[103], get_footer_slot_context_4), get_slot_changes(footer_slot_template, /*$$scope*/ ctx[103], dirty, get_footer_slot_changes_4));
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
    		}
    	};
    }

    // (496:14) {#if isSortable && sortable !== false && isSortableOpposite}
    function create_if_block_46(ctx) {
    	let div;

    	return {
    		c() {
    			div = element("div");
    			attr(div, "class", "sortable-handler");
    		},
    		m(target, anchor) {
    			insert(target, div, anchor);
    		},
    		d(detaching) {
    			if (detaching) detach(div);
    		}
    	};
    }

    // (511:14) {#if hasMedia}
    function create_if_block_44(ctx) {
    	let div;
    	let t;
    	let current;
    	let if_block = typeof /*media*/ ctx[2] !== "undefined" && create_if_block_45(ctx);
    	const media_slot_template = /*$$slots*/ ctx[89].media;
    	const media_slot = create_slot(media_slot_template, ctx, /*$$scope*/ ctx[103], get_media_slot_context_1);

    	return {
    		c() {
    			div = element("div");
    			if (if_block) if_block.c();
    			t = space();
    			if (media_slot) media_slot.c();
    			attr(div, "class", "item-media");
    		},
    		m(target, anchor) {
    			insert(target, div, anchor);
    			if (if_block) if_block.m(div, null);
    			append(div, t);

    			if (media_slot) {
    				media_slot.m(div, null);
    			}

    			current = true;
    		},
    		p(ctx, dirty) {
    			if (typeof /*media*/ ctx[2] !== "undefined") {
    				if (if_block) {
    					if_block.p(ctx, dirty);
    				} else {
    					if_block = create_if_block_45(ctx);
    					if_block.c();
    					if_block.m(div, t);
    				}
    			} else if (if_block) {
    				if_block.d(1);
    				if_block = null;
    			}

    			if (media_slot) {
    				if (media_slot.p && dirty[3] & /*$$scope*/ 1024) {
    					media_slot.p(get_slot_context(media_slot_template, ctx, /*$$scope*/ ctx[103], get_media_slot_context_1), get_slot_changes(media_slot_template, /*$$scope*/ ctx[103], dirty, get_media_slot_changes_1));
    				}
    			}
    		},
    		i(local) {
    			if (current) return;
    			transition_in(media_slot, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(media_slot, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(div);
    			if (if_block) if_block.d();
    			if (media_slot) media_slot.d(detaching);
    		}
    	};
    }

    // (513:18) {#if typeof media !== 'undefined'}
    function create_if_block_45(ctx) {
    	let img;
    	let img_src_value;

    	return {
    		c() {
    			img = element("img");
    			if (img.src !== (img_src_value = /*media*/ ctx[2])) attr(img, "src", img_src_value);
    		},
    		m(target, anchor) {
    			insert(target, img, anchor);
    		},
    		p(ctx, dirty) {
    			if (dirty[0] & /*media*/ 4 && img.src !== (img_src_value = /*media*/ ctx[2])) {
    				attr(img, "src", img_src_value);
    			}
    		},
    		d(detaching) {
    			if (detaching) detach(img);
    		}
    	};
    }

    // (573:16) {:else}
    function create_else_block_3(ctx) {
    	let t0;
    	let t1;
    	let t2;
    	let t3;
    	let t4;
    	let if_block2_anchor;
    	let current;
    	const before_title_slot_template = /*$$slots*/ ctx[89]["before-title"];
    	const before_title_slot = create_slot(before_title_slot_template, ctx, /*$$scope*/ ctx[103], get_before_title_slot_context_3);
    	let if_block0 = (/*hasTitle*/ ctx[37] || /*hasHeader*/ ctx[38] || /*hasFooter*/ ctx[39]) && create_if_block_41(ctx);
    	const after_title_slot_template = /*$$slots*/ ctx[89]["after-title"];
    	const after_title_slot = create_slot(after_title_slot_template, ctx, /*$$scope*/ ctx[103], get_after_title_slot_context_3);
    	let if_block1 = /*hasAfter*/ ctx[42] && create_if_block_38(ctx);
    	const inner_slot_template = /*$$slots*/ ctx[89].inner;
    	const inner_slot = create_slot(inner_slot_template, ctx, /*$$scope*/ ctx[103], get_inner_slot_context_3);
    	let if_block2 = !(/*swipeout*/ ctx[11] || /*accordionItem*/ ctx[13]) && create_if_block_37(ctx);

    	return {
    		c() {
    			if (before_title_slot) before_title_slot.c();
    			t0 = space();
    			if (if_block0) if_block0.c();
    			t1 = space();
    			if (after_title_slot) after_title_slot.c();
    			t2 = space();
    			if (if_block1) if_block1.c();
    			t3 = space();
    			if (inner_slot) inner_slot.c();
    			t4 = space();
    			if (if_block2) if_block2.c();
    			if_block2_anchor = empty();
    		},
    		m(target, anchor) {
    			if (before_title_slot) {
    				before_title_slot.m(target, anchor);
    			}

    			insert(target, t0, anchor);
    			if (if_block0) if_block0.m(target, anchor);
    			insert(target, t1, anchor);

    			if (after_title_slot) {
    				after_title_slot.m(target, anchor);
    			}

    			insert(target, t2, anchor);
    			if (if_block1) if_block1.m(target, anchor);
    			insert(target, t3, anchor);

    			if (inner_slot) {
    				inner_slot.m(target, anchor);
    			}

    			insert(target, t4, anchor);
    			if (if_block2) if_block2.m(target, anchor);
    			insert(target, if_block2_anchor, anchor);
    			current = true;
    		},
    		p(ctx, dirty) {
    			if (before_title_slot) {
    				if (before_title_slot.p && dirty[3] & /*$$scope*/ 1024) {
    					before_title_slot.p(get_slot_context(before_title_slot_template, ctx, /*$$scope*/ ctx[103], get_before_title_slot_context_3), get_slot_changes(before_title_slot_template, /*$$scope*/ ctx[103], dirty, get_before_title_slot_changes_3));
    				}
    			}

    			if (/*hasTitle*/ ctx[37] || /*hasHeader*/ ctx[38] || /*hasFooter*/ ctx[39]) {
    				if (if_block0) {
    					if_block0.p(ctx, dirty);

    					if (dirty[1] & /*hasTitle, hasHeader, hasFooter*/ 448) {
    						transition_in(if_block0, 1);
    					}
    				} else {
    					if_block0 = create_if_block_41(ctx);
    					if_block0.c();
    					transition_in(if_block0, 1);
    					if_block0.m(t1.parentNode, t1);
    				}
    			} else if (if_block0) {
    				group_outros();

    				transition_out(if_block0, 1, 1, () => {
    					if_block0 = null;
    				});

    				check_outros();
    			}

    			if (after_title_slot) {
    				if (after_title_slot.p && dirty[3] & /*$$scope*/ 1024) {
    					after_title_slot.p(get_slot_context(after_title_slot_template, ctx, /*$$scope*/ ctx[103], get_after_title_slot_context_3), get_slot_changes(after_title_slot_template, /*$$scope*/ ctx[103], dirty, get_after_title_slot_changes_3));
    				}
    			}

    			if (/*hasAfter*/ ctx[42]) {
    				if (if_block1) {
    					if_block1.p(ctx, dirty);

    					if (dirty[1] & /*hasAfter*/ 2048) {
    						transition_in(if_block1, 1);
    					}
    				} else {
    					if_block1 = create_if_block_38(ctx);
    					if_block1.c();
    					transition_in(if_block1, 1);
    					if_block1.m(t3.parentNode, t3);
    				}
    			} else if (if_block1) {
    				group_outros();

    				transition_out(if_block1, 1, 1, () => {
    					if_block1 = null;
    				});

    				check_outros();
    			}

    			if (inner_slot) {
    				if (inner_slot.p && dirty[3] & /*$$scope*/ 1024) {
    					inner_slot.p(get_slot_context(inner_slot_template, ctx, /*$$scope*/ ctx[103], get_inner_slot_context_3), get_slot_changes(inner_slot_template, /*$$scope*/ ctx[103], dirty, get_inner_slot_changes_3));
    				}
    			}

    			if (!(/*swipeout*/ ctx[11] || /*accordionItem*/ ctx[13])) {
    				if (if_block2) {
    					if_block2.p(ctx, dirty);

    					if (dirty[0] & /*swipeout, accordionItem*/ 10240) {
    						transition_in(if_block2, 1);
    					}
    				} else {
    					if_block2 = create_if_block_37(ctx);
    					if_block2.c();
    					transition_in(if_block2, 1);
    					if_block2.m(if_block2_anchor.parentNode, if_block2_anchor);
    				}
    			} else if (if_block2) {
    				group_outros();

    				transition_out(if_block2, 1, 1, () => {
    					if_block2 = null;
    				});

    				check_outros();
    			}
    		},
    		i(local) {
    			if (current) return;
    			transition_in(before_title_slot, local);
    			transition_in(if_block0);
    			transition_in(after_title_slot, local);
    			transition_in(if_block1);
    			transition_in(inner_slot, local);
    			transition_in(if_block2);
    			current = true;
    		},
    		o(local) {
    			transition_out(before_title_slot, local);
    			transition_out(if_block0);
    			transition_out(after_title_slot, local);
    			transition_out(if_block1);
    			transition_out(inner_slot, local);
    			transition_out(if_block2);
    			current = false;
    		},
    		d(detaching) {
    			if (before_title_slot) before_title_slot.d(detaching);
    			if (detaching) detach(t0);
    			if (if_block0) if_block0.d(detaching);
    			if (detaching) detach(t1);
    			if (after_title_slot) after_title_slot.d(detaching);
    			if (detaching) detach(t2);
    			if (if_block1) if_block1.d(detaching);
    			if (detaching) detach(t3);
    			if (inner_slot) inner_slot.d(detaching);
    			if (detaching) detach(t4);
    			if (if_block2) if_block2.d(detaching);
    			if (detaching) detach(if_block2_anchor);
    		}
    	};
    }

    // (521:16) {#if isMedia}
    function create_if_block_27(ctx) {
    	let t0;
    	let div;
    	let t1;
    	let t2;
    	let t3;
    	let t4;
    	let t5;
    	let t6;
    	let t7;
    	let t8;
    	let if_block6_anchor;
    	let current;
    	let if_block0 = /*hasHeader*/ ctx[38] && create_if_block_36(ctx);
    	const before_title_slot_template = /*$$slots*/ ctx[89]["before-title"];
    	const before_title_slot = create_slot(before_title_slot_template, ctx, /*$$scope*/ ctx[103], get_before_title_slot_context_2);
    	let if_block1 = /*hasTitle*/ ctx[37] && create_if_block_35(ctx);
    	const after_title_slot_template = /*$$slots*/ ctx[89]["after-title"];
    	const after_title_slot = create_slot(after_title_slot_template, ctx, /*$$scope*/ ctx[103], get_after_title_slot_context_2);
    	let if_block2 = /*hasAfter*/ ctx[42] && create_if_block_32(ctx);
    	let if_block3 = /*hasSubtitle*/ ctx[40] && create_if_block_31(ctx);
    	let if_block4 = /*hasText*/ ctx[41] && create_if_block_30(ctx);
    	const inner_slot_template = /*$$slots*/ ctx[89].inner;
    	const inner_slot = create_slot(inner_slot_template, ctx, /*$$scope*/ ctx[103], get_inner_slot_context_2);
    	let if_block5 = !(/*swipeout*/ ctx[11] || /*accordionItem*/ ctx[13]) && create_if_block_29(ctx);
    	let if_block6 = /*hasFooter*/ ctx[39] && create_if_block_28(ctx);

    	return {
    		c() {
    			if (if_block0) if_block0.c();
    			t0 = space();
    			div = element("div");
    			if (before_title_slot) before_title_slot.c();
    			t1 = space();
    			if (if_block1) if_block1.c();
    			t2 = space();
    			if (after_title_slot) after_title_slot.c();
    			t3 = space();
    			if (if_block2) if_block2.c();
    			t4 = space();
    			if (if_block3) if_block3.c();
    			t5 = space();
    			if (if_block4) if_block4.c();
    			t6 = space();
    			if (inner_slot) inner_slot.c();
    			t7 = space();
    			if (if_block5) if_block5.c();
    			t8 = space();
    			if (if_block6) if_block6.c();
    			if_block6_anchor = empty();
    			attr(div, "class", "item-title-row");
    		},
    		m(target, anchor) {
    			if (if_block0) if_block0.m(target, anchor);
    			insert(target, t0, anchor);
    			insert(target, div, anchor);

    			if (before_title_slot) {
    				before_title_slot.m(div, null);
    			}

    			append(div, t1);
    			if (if_block1) if_block1.m(div, null);
    			append(div, t2);

    			if (after_title_slot) {
    				after_title_slot.m(div, null);
    			}

    			append(div, t3);
    			if (if_block2) if_block2.m(div, null);
    			insert(target, t4, anchor);
    			if (if_block3) if_block3.m(target, anchor);
    			insert(target, t5, anchor);
    			if (if_block4) if_block4.m(target, anchor);
    			insert(target, t6, anchor);

    			if (inner_slot) {
    				inner_slot.m(target, anchor);
    			}

    			insert(target, t7, anchor);
    			if (if_block5) if_block5.m(target, anchor);
    			insert(target, t8, anchor);
    			if (if_block6) if_block6.m(target, anchor);
    			insert(target, if_block6_anchor, anchor);
    			current = true;
    		},
    		p(ctx, dirty) {
    			if (/*hasHeader*/ ctx[38]) {
    				if (if_block0) {
    					if_block0.p(ctx, dirty);

    					if (dirty[1] & /*hasHeader*/ 128) {
    						transition_in(if_block0, 1);
    					}
    				} else {
    					if_block0 = create_if_block_36(ctx);
    					if_block0.c();
    					transition_in(if_block0, 1);
    					if_block0.m(t0.parentNode, t0);
    				}
    			} else if (if_block0) {
    				group_outros();

    				transition_out(if_block0, 1, 1, () => {
    					if_block0 = null;
    				});

    				check_outros();
    			}

    			if (before_title_slot) {
    				if (before_title_slot.p && dirty[3] & /*$$scope*/ 1024) {
    					before_title_slot.p(get_slot_context(before_title_slot_template, ctx, /*$$scope*/ ctx[103], get_before_title_slot_context_2), get_slot_changes(before_title_slot_template, /*$$scope*/ ctx[103], dirty, get_before_title_slot_changes_2));
    				}
    			}

    			if (/*hasTitle*/ ctx[37]) {
    				if (if_block1) {
    					if_block1.p(ctx, dirty);

    					if (dirty[1] & /*hasTitle*/ 64) {
    						transition_in(if_block1, 1);
    					}
    				} else {
    					if_block1 = create_if_block_35(ctx);
    					if_block1.c();
    					transition_in(if_block1, 1);
    					if_block1.m(div, t2);
    				}
    			} else if (if_block1) {
    				group_outros();

    				transition_out(if_block1, 1, 1, () => {
    					if_block1 = null;
    				});

    				check_outros();
    			}

    			if (after_title_slot) {
    				if (after_title_slot.p && dirty[3] & /*$$scope*/ 1024) {
    					after_title_slot.p(get_slot_context(after_title_slot_template, ctx, /*$$scope*/ ctx[103], get_after_title_slot_context_2), get_slot_changes(after_title_slot_template, /*$$scope*/ ctx[103], dirty, get_after_title_slot_changes_2));
    				}
    			}

    			if (/*hasAfter*/ ctx[42]) {
    				if (if_block2) {
    					if_block2.p(ctx, dirty);

    					if (dirty[1] & /*hasAfter*/ 2048) {
    						transition_in(if_block2, 1);
    					}
    				} else {
    					if_block2 = create_if_block_32(ctx);
    					if_block2.c();
    					transition_in(if_block2, 1);
    					if_block2.m(div, null);
    				}
    			} else if (if_block2) {
    				group_outros();

    				transition_out(if_block2, 1, 1, () => {
    					if_block2 = null;
    				});

    				check_outros();
    			}

    			if (/*hasSubtitle*/ ctx[40]) {
    				if (if_block3) {
    					if_block3.p(ctx, dirty);

    					if (dirty[1] & /*hasSubtitle*/ 512) {
    						transition_in(if_block3, 1);
    					}
    				} else {
    					if_block3 = create_if_block_31(ctx);
    					if_block3.c();
    					transition_in(if_block3, 1);
    					if_block3.m(t5.parentNode, t5);
    				}
    			} else if (if_block3) {
    				group_outros();

    				transition_out(if_block3, 1, 1, () => {
    					if_block3 = null;
    				});

    				check_outros();
    			}

    			if (/*hasText*/ ctx[41]) {
    				if (if_block4) {
    					if_block4.p(ctx, dirty);

    					if (dirty[1] & /*hasText*/ 1024) {
    						transition_in(if_block4, 1);
    					}
    				} else {
    					if_block4 = create_if_block_30(ctx);
    					if_block4.c();
    					transition_in(if_block4, 1);
    					if_block4.m(t6.parentNode, t6);
    				}
    			} else if (if_block4) {
    				group_outros();

    				transition_out(if_block4, 1, 1, () => {
    					if_block4 = null;
    				});

    				check_outros();
    			}

    			if (inner_slot) {
    				if (inner_slot.p && dirty[3] & /*$$scope*/ 1024) {
    					inner_slot.p(get_slot_context(inner_slot_template, ctx, /*$$scope*/ ctx[103], get_inner_slot_context_2), get_slot_changes(inner_slot_template, /*$$scope*/ ctx[103], dirty, get_inner_slot_changes_2));
    				}
    			}

    			if (!(/*swipeout*/ ctx[11] || /*accordionItem*/ ctx[13])) {
    				if (if_block5) {
    					if_block5.p(ctx, dirty);

    					if (dirty[0] & /*swipeout, accordionItem*/ 10240) {
    						transition_in(if_block5, 1);
    					}
    				} else {
    					if_block5 = create_if_block_29(ctx);
    					if_block5.c();
    					transition_in(if_block5, 1);
    					if_block5.m(t8.parentNode, t8);
    				}
    			} else if (if_block5) {
    				group_outros();

    				transition_out(if_block5, 1, 1, () => {
    					if_block5 = null;
    				});

    				check_outros();
    			}

    			if (/*hasFooter*/ ctx[39]) {
    				if (if_block6) {
    					if_block6.p(ctx, dirty);

    					if (dirty[1] & /*hasFooter*/ 256) {
    						transition_in(if_block6, 1);
    					}
    				} else {
    					if_block6 = create_if_block_28(ctx);
    					if_block6.c();
    					transition_in(if_block6, 1);
    					if_block6.m(if_block6_anchor.parentNode, if_block6_anchor);
    				}
    			} else if (if_block6) {
    				group_outros();

    				transition_out(if_block6, 1, 1, () => {
    					if_block6 = null;
    				});

    				check_outros();
    			}
    		},
    		i(local) {
    			if (current) return;
    			transition_in(if_block0);
    			transition_in(before_title_slot, local);
    			transition_in(if_block1);
    			transition_in(after_title_slot, local);
    			transition_in(if_block2);
    			transition_in(if_block3);
    			transition_in(if_block4);
    			transition_in(inner_slot, local);
    			transition_in(if_block5);
    			transition_in(if_block6);
    			current = true;
    		},
    		o(local) {
    			transition_out(if_block0);
    			transition_out(before_title_slot, local);
    			transition_out(if_block1);
    			transition_out(after_title_slot, local);
    			transition_out(if_block2);
    			transition_out(if_block3);
    			transition_out(if_block4);
    			transition_out(inner_slot, local);
    			transition_out(if_block5);
    			transition_out(if_block6);
    			current = false;
    		},
    		d(detaching) {
    			if (if_block0) if_block0.d(detaching);
    			if (detaching) detach(t0);
    			if (detaching) detach(div);
    			if (before_title_slot) before_title_slot.d(detaching);
    			if (if_block1) if_block1.d();
    			if (after_title_slot) after_title_slot.d(detaching);
    			if (if_block2) if_block2.d();
    			if (detaching) detach(t4);
    			if (if_block3) if_block3.d(detaching);
    			if (detaching) detach(t5);
    			if (if_block4) if_block4.d(detaching);
    			if (detaching) detach(t6);
    			if (inner_slot) inner_slot.d(detaching);
    			if (detaching) detach(t7);
    			if (if_block5) if_block5.d(detaching);
    			if (detaching) detach(t8);
    			if (if_block6) if_block6.d(detaching);
    			if (detaching) detach(if_block6_anchor);
    		}
    	};
    }

    // (575:18) {#if (hasTitle || hasHeader || hasFooter)}
    function create_if_block_41(ctx) {
    	let div;
    	let t0;
    	let t1_value = Utils.text(/*title*/ ctx[0]) + "";
    	let t1;
    	let t2;
    	let t3;
    	let current;
    	let if_block0 = /*hasHeader*/ ctx[38] && create_if_block_43(ctx);
    	const title_slot_template = /*$$slots*/ ctx[89].title;
    	const title_slot = create_slot(title_slot_template, ctx, /*$$scope*/ ctx[103], get_title_slot_context_3);
    	let if_block1 = /*hasFooter*/ ctx[39] && create_if_block_42(ctx);

    	return {
    		c() {
    			div = element("div");
    			if (if_block0) if_block0.c();
    			t0 = space();
    			t1 = text(t1_value);
    			t2 = space();
    			if (title_slot) title_slot.c();
    			t3 = space();
    			if (if_block1) if_block1.c();
    			attr(div, "class", "item-title");
    		},
    		m(target, anchor) {
    			insert(target, div, anchor);
    			if (if_block0) if_block0.m(div, null);
    			append(div, t0);
    			append(div, t1);
    			append(div, t2);

    			if (title_slot) {
    				title_slot.m(div, null);
    			}

    			append(div, t3);
    			if (if_block1) if_block1.m(div, null);
    			current = true;
    		},
    		p(ctx, dirty) {
    			if (/*hasHeader*/ ctx[38]) {
    				if (if_block0) {
    					if_block0.p(ctx, dirty);

    					if (dirty[1] & /*hasHeader*/ 128) {
    						transition_in(if_block0, 1);
    					}
    				} else {
    					if_block0 = create_if_block_43(ctx);
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

    			if ((!current || dirty[0] & /*title*/ 1) && t1_value !== (t1_value = Utils.text(/*title*/ ctx[0]) + "")) set_data(t1, t1_value);

    			if (title_slot) {
    				if (title_slot.p && dirty[3] & /*$$scope*/ 1024) {
    					title_slot.p(get_slot_context(title_slot_template, ctx, /*$$scope*/ ctx[103], get_title_slot_context_3), get_slot_changes(title_slot_template, /*$$scope*/ ctx[103], dirty, get_title_slot_changes_3));
    				}
    			}

    			if (/*hasFooter*/ ctx[39]) {
    				if (if_block1) {
    					if_block1.p(ctx, dirty);

    					if (dirty[1] & /*hasFooter*/ 256) {
    						transition_in(if_block1, 1);
    					}
    				} else {
    					if_block1 = create_if_block_42(ctx);
    					if_block1.c();
    					transition_in(if_block1, 1);
    					if_block1.m(div, null);
    				}
    			} else if (if_block1) {
    				group_outros();

    				transition_out(if_block1, 1, 1, () => {
    					if_block1 = null;
    				});

    				check_outros();
    			}
    		},
    		i(local) {
    			if (current) return;
    			transition_in(if_block0);
    			transition_in(title_slot, local);
    			transition_in(if_block1);
    			current = true;
    		},
    		o(local) {
    			transition_out(if_block0);
    			transition_out(title_slot, local);
    			transition_out(if_block1);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(div);
    			if (if_block0) if_block0.d();
    			if (title_slot) title_slot.d(detaching);
    			if (if_block1) if_block1.d();
    		}
    	};
    }

    // (577:22) {#if hasHeader}
    function create_if_block_43(ctx) {
    	let div;
    	let t0_value = Utils.text(/*header*/ ctx[4]) + "";
    	let t0;
    	let t1;
    	let current;
    	const header_slot_template = /*$$slots*/ ctx[89].header;
    	const header_slot = create_slot(header_slot_template, ctx, /*$$scope*/ ctx[103], get_header_slot_context_3);

    	return {
    		c() {
    			div = element("div");
    			t0 = text(t0_value);
    			t1 = space();
    			if (header_slot) header_slot.c();
    			attr(div, "class", "item-header");
    		},
    		m(target, anchor) {
    			insert(target, div, anchor);
    			append(div, t0);
    			append(div, t1);

    			if (header_slot) {
    				header_slot.m(div, null);
    			}

    			current = true;
    		},
    		p(ctx, dirty) {
    			if ((!current || dirty[0] & /*header*/ 16) && t0_value !== (t0_value = Utils.text(/*header*/ ctx[4]) + "")) set_data(t0, t0_value);

    			if (header_slot) {
    				if (header_slot.p && dirty[3] & /*$$scope*/ 1024) {
    					header_slot.p(get_slot_context(header_slot_template, ctx, /*$$scope*/ ctx[103], get_header_slot_context_3), get_slot_changes(header_slot_template, /*$$scope*/ ctx[103], dirty, get_header_slot_changes_3));
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
    		}
    	};
    }

    // (585:22) {#if hasFooter}
    function create_if_block_42(ctx) {
    	let div;
    	let t0_value = Utils.text(/*footer*/ ctx[5]) + "";
    	let t0;
    	let t1;
    	let current;
    	const footer_slot_template = /*$$slots*/ ctx[89].footer;
    	const footer_slot = create_slot(footer_slot_template, ctx, /*$$scope*/ ctx[103], get_footer_slot_context_3);

    	return {
    		c() {
    			div = element("div");
    			t0 = text(t0_value);
    			t1 = space();
    			if (footer_slot) footer_slot.c();
    			attr(div, "class", "item-footer");
    		},
    		m(target, anchor) {
    			insert(target, div, anchor);
    			append(div, t0);
    			append(div, t1);

    			if (footer_slot) {
    				footer_slot.m(div, null);
    			}

    			current = true;
    		},
    		p(ctx, dirty) {
    			if ((!current || dirty[0] & /*footer*/ 32) && t0_value !== (t0_value = Utils.text(/*footer*/ ctx[5]) + "")) set_data(t0, t0_value);

    			if (footer_slot) {
    				if (footer_slot.p && dirty[3] & /*$$scope*/ 1024) {
    					footer_slot.p(get_slot_context(footer_slot_template, ctx, /*$$scope*/ ctx[103], get_footer_slot_context_3), get_slot_changes(footer_slot_template, /*$$scope*/ ctx[103], dirty, get_footer_slot_changes_3));
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
    		}
    	};
    }

    // (594:18) {#if hasAfter}
    function create_if_block_38(ctx) {
    	let div;
    	let t0;
    	let t1;
    	let t2;
    	let t3;
    	let current;
    	const after_start_slot_template = /*$$slots*/ ctx[89]["after-start"];
    	const after_start_slot = create_slot(after_start_slot_template, ctx, /*$$scope*/ ctx[103], get_after_start_slot_context_3);
    	let if_block0 = typeof /*after*/ ctx[6] !== "undefined" && create_if_block_40(ctx);
    	let if_block1 = typeof /*badge*/ ctx[7] !== "undefined" && create_if_block_39(ctx);
    	const after_slot_template = /*$$slots*/ ctx[89].after;
    	const after_slot = create_slot(after_slot_template, ctx, /*$$scope*/ ctx[103], get_after_slot_context_3);
    	const after_end_slot_template = /*$$slots*/ ctx[89]["after-end"];
    	const after_end_slot = create_slot(after_end_slot_template, ctx, /*$$scope*/ ctx[103], get_after_end_slot_context_3);

    	return {
    		c() {
    			div = element("div");
    			if (after_start_slot) after_start_slot.c();
    			t0 = space();
    			if (if_block0) if_block0.c();
    			t1 = space();
    			if (if_block1) if_block1.c();
    			t2 = space();
    			if (after_slot) after_slot.c();
    			t3 = space();
    			if (after_end_slot) after_end_slot.c();
    			attr(div, "class", "item-after");
    		},
    		m(target, anchor) {
    			insert(target, div, anchor);

    			if (after_start_slot) {
    				after_start_slot.m(div, null);
    			}

    			append(div, t0);
    			if (if_block0) if_block0.m(div, null);
    			append(div, t1);
    			if (if_block1) if_block1.m(div, null);
    			append(div, t2);

    			if (after_slot) {
    				after_slot.m(div, null);
    			}

    			append(div, t3);

    			if (after_end_slot) {
    				after_end_slot.m(div, null);
    			}

    			current = true;
    		},
    		p(ctx, dirty) {
    			if (after_start_slot) {
    				if (after_start_slot.p && dirty[3] & /*$$scope*/ 1024) {
    					after_start_slot.p(get_slot_context(after_start_slot_template, ctx, /*$$scope*/ ctx[103], get_after_start_slot_context_3), get_slot_changes(after_start_slot_template, /*$$scope*/ ctx[103], dirty, get_after_start_slot_changes_3));
    				}
    			}

    			if (typeof /*after*/ ctx[6] !== "undefined") {
    				if (if_block0) {
    					if_block0.p(ctx, dirty);
    				} else {
    					if_block0 = create_if_block_40(ctx);
    					if_block0.c();
    					if_block0.m(div, t1);
    				}
    			} else if (if_block0) {
    				if_block0.d(1);
    				if_block0 = null;
    			}

    			if (typeof /*badge*/ ctx[7] !== "undefined") {
    				if (if_block1) {
    					if_block1.p(ctx, dirty);

    					if (dirty[0] & /*badge*/ 128) {
    						transition_in(if_block1, 1);
    					}
    				} else {
    					if_block1 = create_if_block_39(ctx);
    					if_block1.c();
    					transition_in(if_block1, 1);
    					if_block1.m(div, t2);
    				}
    			} else if (if_block1) {
    				group_outros();

    				transition_out(if_block1, 1, 1, () => {
    					if_block1 = null;
    				});

    				check_outros();
    			}

    			if (after_slot) {
    				if (after_slot.p && dirty[3] & /*$$scope*/ 1024) {
    					after_slot.p(get_slot_context(after_slot_template, ctx, /*$$scope*/ ctx[103], get_after_slot_context_3), get_slot_changes(after_slot_template, /*$$scope*/ ctx[103], dirty, get_after_slot_changes_3));
    				}
    			}

    			if (after_end_slot) {
    				if (after_end_slot.p && dirty[3] & /*$$scope*/ 1024) {
    					after_end_slot.p(get_slot_context(after_end_slot_template, ctx, /*$$scope*/ ctx[103], get_after_end_slot_context_3), get_slot_changes(after_end_slot_template, /*$$scope*/ ctx[103], dirty, get_after_end_slot_changes_3));
    				}
    			}
    		},
    		i(local) {
    			if (current) return;
    			transition_in(after_start_slot, local);
    			transition_in(if_block1);
    			transition_in(after_slot, local);
    			transition_in(after_end_slot, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(after_start_slot, local);
    			transition_out(if_block1);
    			transition_out(after_slot, local);
    			transition_out(after_end_slot, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(div);
    			if (after_start_slot) after_start_slot.d(detaching);
    			if (if_block0) if_block0.d();
    			if (if_block1) if_block1.d();
    			if (after_slot) after_slot.d(detaching);
    			if (after_end_slot) after_end_slot.d(detaching);
    		}
    	};
    }

    // (597:22) {#if typeof after !== 'undefined'}
    function create_if_block_40(ctx) {
    	let span;
    	let t_value = Utils.text(/*after*/ ctx[6]) + "";
    	let t;

    	return {
    		c() {
    			span = element("span");
    			t = text(t_value);
    		},
    		m(target, anchor) {
    			insert(target, span, anchor);
    			append(span, t);
    		},
    		p(ctx, dirty) {
    			if (dirty[0] & /*after*/ 64 && t_value !== (t_value = Utils.text(/*after*/ ctx[6]) + "")) set_data(t, t_value);
    		},
    		d(detaching) {
    			if (detaching) detach(span);
    		}
    	};
    }

    // (600:22) {#if typeof badge !== 'undefined'}
    function create_if_block_39(ctx) {
    	let current;

    	const badge_1 = new Badge({
    			props: {
    				color: /*badgeColor*/ ctx[8],
    				$$slots: { default: [create_default_slot_3] },
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
    			if (dirty[0] & /*badgeColor*/ 256) badge_1_changes.color = /*badgeColor*/ ctx[8];

    			if (dirty[0] & /*badge*/ 128 | dirty[3] & /*$$scope*/ 1024) {
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

    // (601:24) <Badge color={badgeColor}>
    function create_default_slot_3(ctx) {
    	let t_value = Utils.text(/*badge*/ ctx[7]) + "";
    	let t;

    	return {
    		c() {
    			t = text(t_value);
    		},
    		m(target, anchor) {
    			insert(target, t, anchor);
    		},
    		p(ctx, dirty) {
    			if (dirty[0] & /*badge*/ 128 && t_value !== (t_value = Utils.text(/*badge*/ ctx[7]) + "")) set_data(t, t_value);
    		},
    		d(detaching) {
    			if (detaching) detach(t);
    		}
    	};
    }

    // (608:18) {#if !(swipeout || accordionItem)}
    function create_if_block_37(ctx) {
    	let current;
    	const default_slot_template = /*$$slots*/ ctx[89].default;
    	const default_slot = create_slot(default_slot_template, ctx, /*$$scope*/ ctx[103], null);

    	return {
    		c() {
    			if (default_slot) default_slot.c();
    		},
    		m(target, anchor) {
    			if (default_slot) {
    				default_slot.m(target, anchor);
    			}

    			current = true;
    		},
    		p(ctx, dirty) {
    			if (default_slot) {
    				if (default_slot.p && dirty[3] & /*$$scope*/ 1024) {
    					default_slot.p(get_slot_context(default_slot_template, ctx, /*$$scope*/ ctx[103], null), get_slot_changes(default_slot_template, /*$$scope*/ ctx[103], dirty, null));
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
    			if (default_slot) default_slot.d(detaching);
    		}
    	};
    }

    // (522:18) {#if hasHeader}
    function create_if_block_36(ctx) {
    	let div;
    	let t0_value = Utils.text(/*header*/ ctx[4]) + "";
    	let t0;
    	let t1;
    	let current;
    	const header_slot_template = /*$$slots*/ ctx[89].header;
    	const header_slot = create_slot(header_slot_template, ctx, /*$$scope*/ ctx[103], get_header_slot_context_2);

    	return {
    		c() {
    			div = element("div");
    			t0 = text(t0_value);
    			t1 = space();
    			if (header_slot) header_slot.c();
    			attr(div, "class", "item-header");
    		},
    		m(target, anchor) {
    			insert(target, div, anchor);
    			append(div, t0);
    			append(div, t1);

    			if (header_slot) {
    				header_slot.m(div, null);
    			}

    			current = true;
    		},
    		p(ctx, dirty) {
    			if ((!current || dirty[0] & /*header*/ 16) && t0_value !== (t0_value = Utils.text(/*header*/ ctx[4]) + "")) set_data(t0, t0_value);

    			if (header_slot) {
    				if (header_slot.p && dirty[3] & /*$$scope*/ 1024) {
    					header_slot.p(get_slot_context(header_slot_template, ctx, /*$$scope*/ ctx[103], get_header_slot_context_2), get_slot_changes(header_slot_template, /*$$scope*/ ctx[103], dirty, get_header_slot_changes_2));
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
    		}
    	};
    }

    // (530:20) {#if (hasTitle)}
    function create_if_block_35(ctx) {
    	let div;
    	let t0_value = Utils.text(/*title*/ ctx[0]) + "";
    	let t0;
    	let t1;
    	let current;
    	const title_slot_template = /*$$slots*/ ctx[89].title;
    	const title_slot = create_slot(title_slot_template, ctx, /*$$scope*/ ctx[103], get_title_slot_context_2);

    	return {
    		c() {
    			div = element("div");
    			t0 = text(t0_value);
    			t1 = space();
    			if (title_slot) title_slot.c();
    			attr(div, "class", "item-title");
    		},
    		m(target, anchor) {
    			insert(target, div, anchor);
    			append(div, t0);
    			append(div, t1);

    			if (title_slot) {
    				title_slot.m(div, null);
    			}

    			current = true;
    		},
    		p(ctx, dirty) {
    			if ((!current || dirty[0] & /*title*/ 1) && t0_value !== (t0_value = Utils.text(/*title*/ ctx[0]) + "")) set_data(t0, t0_value);

    			if (title_slot) {
    				if (title_slot.p && dirty[3] & /*$$scope*/ 1024) {
    					title_slot.p(get_slot_context(title_slot_template, ctx, /*$$scope*/ ctx[103], get_title_slot_context_2), get_slot_changes(title_slot_template, /*$$scope*/ ctx[103], dirty, get_title_slot_changes_2));
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
    			if (detaching) detach(div);
    			if (title_slot) title_slot.d(detaching);
    		}
    	};
    }

    // (537:20) {#if hasAfter}
    function create_if_block_32(ctx) {
    	let div;
    	let t0;
    	let t1;
    	let t2;
    	let t3;
    	let current;
    	const after_start_slot_template = /*$$slots*/ ctx[89]["after-start"];
    	const after_start_slot = create_slot(after_start_slot_template, ctx, /*$$scope*/ ctx[103], get_after_start_slot_context_2);
    	let if_block0 = typeof /*after*/ ctx[6] !== "undefined" && create_if_block_34(ctx);
    	let if_block1 = typeof /*badge*/ ctx[7] !== "undefined" && create_if_block_33(ctx);
    	const after_slot_template = /*$$slots*/ ctx[89].after;
    	const after_slot = create_slot(after_slot_template, ctx, /*$$scope*/ ctx[103], get_after_slot_context_2);
    	const after_end_slot_template = /*$$slots*/ ctx[89]["after-end"];
    	const after_end_slot = create_slot(after_end_slot_template, ctx, /*$$scope*/ ctx[103], get_after_end_slot_context_2);

    	return {
    		c() {
    			div = element("div");
    			if (after_start_slot) after_start_slot.c();
    			t0 = space();
    			if (if_block0) if_block0.c();
    			t1 = space();
    			if (if_block1) if_block1.c();
    			t2 = space();
    			if (after_slot) after_slot.c();
    			t3 = space();
    			if (after_end_slot) after_end_slot.c();
    			attr(div, "class", "item-after");
    		},
    		m(target, anchor) {
    			insert(target, div, anchor);

    			if (after_start_slot) {
    				after_start_slot.m(div, null);
    			}

    			append(div, t0);
    			if (if_block0) if_block0.m(div, null);
    			append(div, t1);
    			if (if_block1) if_block1.m(div, null);
    			append(div, t2);

    			if (after_slot) {
    				after_slot.m(div, null);
    			}

    			append(div, t3);

    			if (after_end_slot) {
    				after_end_slot.m(div, null);
    			}

    			current = true;
    		},
    		p(ctx, dirty) {
    			if (after_start_slot) {
    				if (after_start_slot.p && dirty[3] & /*$$scope*/ 1024) {
    					after_start_slot.p(get_slot_context(after_start_slot_template, ctx, /*$$scope*/ ctx[103], get_after_start_slot_context_2), get_slot_changes(after_start_slot_template, /*$$scope*/ ctx[103], dirty, get_after_start_slot_changes_2));
    				}
    			}

    			if (typeof /*after*/ ctx[6] !== "undefined") {
    				if (if_block0) {
    					if_block0.p(ctx, dirty);
    				} else {
    					if_block0 = create_if_block_34(ctx);
    					if_block0.c();
    					if_block0.m(div, t1);
    				}
    			} else if (if_block0) {
    				if_block0.d(1);
    				if_block0 = null;
    			}

    			if (typeof /*badge*/ ctx[7] !== "undefined") {
    				if (if_block1) {
    					if_block1.p(ctx, dirty);

    					if (dirty[0] & /*badge*/ 128) {
    						transition_in(if_block1, 1);
    					}
    				} else {
    					if_block1 = create_if_block_33(ctx);
    					if_block1.c();
    					transition_in(if_block1, 1);
    					if_block1.m(div, t2);
    				}
    			} else if (if_block1) {
    				group_outros();

    				transition_out(if_block1, 1, 1, () => {
    					if_block1 = null;
    				});

    				check_outros();
    			}

    			if (after_slot) {
    				if (after_slot.p && dirty[3] & /*$$scope*/ 1024) {
    					after_slot.p(get_slot_context(after_slot_template, ctx, /*$$scope*/ ctx[103], get_after_slot_context_2), get_slot_changes(after_slot_template, /*$$scope*/ ctx[103], dirty, get_after_slot_changes_2));
    				}
    			}

    			if (after_end_slot) {
    				if (after_end_slot.p && dirty[3] & /*$$scope*/ 1024) {
    					after_end_slot.p(get_slot_context(after_end_slot_template, ctx, /*$$scope*/ ctx[103], get_after_end_slot_context_2), get_slot_changes(after_end_slot_template, /*$$scope*/ ctx[103], dirty, get_after_end_slot_changes_2));
    				}
    			}
    		},
    		i(local) {
    			if (current) return;
    			transition_in(after_start_slot, local);
    			transition_in(if_block1);
    			transition_in(after_slot, local);
    			transition_in(after_end_slot, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(after_start_slot, local);
    			transition_out(if_block1);
    			transition_out(after_slot, local);
    			transition_out(after_end_slot, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(div);
    			if (after_start_slot) after_start_slot.d(detaching);
    			if (if_block0) if_block0.d();
    			if (if_block1) if_block1.d();
    			if (after_slot) after_slot.d(detaching);
    			if (after_end_slot) after_end_slot.d(detaching);
    		}
    	};
    }

    // (540:24) {#if typeof after !== 'undefined'}
    function create_if_block_34(ctx) {
    	let span;
    	let t_value = Utils.text(/*after*/ ctx[6]) + "";
    	let t;

    	return {
    		c() {
    			span = element("span");
    			t = text(t_value);
    		},
    		m(target, anchor) {
    			insert(target, span, anchor);
    			append(span, t);
    		},
    		p(ctx, dirty) {
    			if (dirty[0] & /*after*/ 64 && t_value !== (t_value = Utils.text(/*after*/ ctx[6]) + "")) set_data(t, t_value);
    		},
    		d(detaching) {
    			if (detaching) detach(span);
    		}
    	};
    }

    // (543:24) {#if typeof badge !== 'undefined'}
    function create_if_block_33(ctx) {
    	let current;

    	const badge_1 = new Badge({
    			props: {
    				color: /*badgeColor*/ ctx[8],
    				$$slots: { default: [create_default_slot_2$2] },
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
    			if (dirty[0] & /*badgeColor*/ 256) badge_1_changes.color = /*badgeColor*/ ctx[8];

    			if (dirty[0] & /*badge*/ 128 | dirty[3] & /*$$scope*/ 1024) {
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

    // (544:26) <Badge color={badgeColor}>
    function create_default_slot_2$2(ctx) {
    	let t_value = Utils.text(/*badge*/ ctx[7]) + "";
    	let t;

    	return {
    		c() {
    			t = text(t_value);
    		},
    		m(target, anchor) {
    			insert(target, t, anchor);
    		},
    		p(ctx, dirty) {
    			if (dirty[0] & /*badge*/ 128 && t_value !== (t_value = Utils.text(/*badge*/ ctx[7]) + "")) set_data(t, t_value);
    		},
    		d(detaching) {
    			if (detaching) detach(t);
    		}
    	};
    }

    // (551:18) {#if hasSubtitle}
    function create_if_block_31(ctx) {
    	let div;
    	let t0_value = Utils.text(/*subtitle*/ ctx[3]) + "";
    	let t0;
    	let t1;
    	let current;
    	const subtitle_slot_template = /*$$slots*/ ctx[89].subtitle;
    	const subtitle_slot = create_slot(subtitle_slot_template, ctx, /*$$scope*/ ctx[103], get_subtitle_slot_context_1);

    	return {
    		c() {
    			div = element("div");
    			t0 = text(t0_value);
    			t1 = space();
    			if (subtitle_slot) subtitle_slot.c();
    			attr(div, "class", "item-subtitle");
    		},
    		m(target, anchor) {
    			insert(target, div, anchor);
    			append(div, t0);
    			append(div, t1);

    			if (subtitle_slot) {
    				subtitle_slot.m(div, null);
    			}

    			current = true;
    		},
    		p(ctx, dirty) {
    			if ((!current || dirty[0] & /*subtitle*/ 8) && t0_value !== (t0_value = Utils.text(/*subtitle*/ ctx[3]) + "")) set_data(t0, t0_value);

    			if (subtitle_slot) {
    				if (subtitle_slot.p && dirty[3] & /*$$scope*/ 1024) {
    					subtitle_slot.p(get_slot_context(subtitle_slot_template, ctx, /*$$scope*/ ctx[103], get_subtitle_slot_context_1), get_slot_changes(subtitle_slot_template, /*$$scope*/ ctx[103], dirty, get_subtitle_slot_changes_1));
    				}
    			}
    		},
    		i(local) {
    			if (current) return;
    			transition_in(subtitle_slot, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(subtitle_slot, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(div);
    			if (subtitle_slot) subtitle_slot.d(detaching);
    		}
    	};
    }

    // (557:18) {#if hasText}
    function create_if_block_30(ctx) {
    	let div;
    	let t0_value = Utils.text(/*text*/ ctx[1]) + "";
    	let t0;
    	let t1;
    	let current;
    	const text_slot_template = /*$$slots*/ ctx[89].text;
    	const text_slot = create_slot(text_slot_template, ctx, /*$$scope*/ ctx[103], get_text_slot_context_1);

    	return {
    		c() {
    			div = element("div");
    			t0 = text(t0_value);
    			t1 = space();
    			if (text_slot) text_slot.c();
    			attr(div, "class", "item-text");
    		},
    		m(target, anchor) {
    			insert(target, div, anchor);
    			append(div, t0);
    			append(div, t1);

    			if (text_slot) {
    				text_slot.m(div, null);
    			}

    			current = true;
    		},
    		p(ctx, dirty) {
    			if ((!current || dirty[0] & /*text*/ 2) && t0_value !== (t0_value = Utils.text(/*text*/ ctx[1]) + "")) set_data(t0, t0_value);

    			if (text_slot) {
    				if (text_slot.p && dirty[3] & /*$$scope*/ 1024) {
    					text_slot.p(get_slot_context(text_slot_template, ctx, /*$$scope*/ ctx[103], get_text_slot_context_1), get_slot_changes(text_slot_template, /*$$scope*/ ctx[103], dirty, get_text_slot_changes_1));
    				}
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
    			if (text_slot) text_slot.d(detaching);
    		}
    	};
    }

    // (564:18) {#if !(swipeout || accordionItem)}
    function create_if_block_29(ctx) {
    	let current;
    	const default_slot_template = /*$$slots*/ ctx[89].default;
    	const default_slot = create_slot(default_slot_template, ctx, /*$$scope*/ ctx[103], null);

    	return {
    		c() {
    			if (default_slot) default_slot.c();
    		},
    		m(target, anchor) {
    			if (default_slot) {
    				default_slot.m(target, anchor);
    			}

    			current = true;
    		},
    		p(ctx, dirty) {
    			if (default_slot) {
    				if (default_slot.p && dirty[3] & /*$$scope*/ 1024) {
    					default_slot.p(get_slot_context(default_slot_template, ctx, /*$$scope*/ ctx[103], null), get_slot_changes(default_slot_template, /*$$scope*/ ctx[103], dirty, null));
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
    			if (default_slot) default_slot.d(detaching);
    		}
    	};
    }

    // (567:18) {#if hasFooter}
    function create_if_block_28(ctx) {
    	let div;
    	let t0_value = Utils.text(/*footer*/ ctx[5]) + "";
    	let t0;
    	let t1;
    	let current;
    	const footer_slot_template = /*$$slots*/ ctx[89].footer;
    	const footer_slot = create_slot(footer_slot_template, ctx, /*$$scope*/ ctx[103], get_footer_slot_context_2);

    	return {
    		c() {
    			div = element("div");
    			t0 = text(t0_value);
    			t1 = space();
    			if (footer_slot) footer_slot.c();
    			attr(div, "class", "item-footer");
    		},
    		m(target, anchor) {
    			insert(target, div, anchor);
    			append(div, t0);
    			append(div, t1);

    			if (footer_slot) {
    				footer_slot.m(div, null);
    			}

    			current = true;
    		},
    		p(ctx, dirty) {
    			if ((!current || dirty[0] & /*footer*/ 32) && t0_value !== (t0_value = Utils.text(/*footer*/ ctx[5]) + "")) set_data(t0, t0_value);

    			if (footer_slot) {
    				if (footer_slot.p && dirty[3] & /*$$scope*/ 1024) {
    					footer_slot.p(get_slot_context(footer_slot_template, ctx, /*$$scope*/ ctx[103], get_footer_slot_context_2), get_slot_changes(footer_slot_template, /*$$scope*/ ctx[103], dirty, get_footer_slot_changes_2));
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
    		}
    	};
    }

    // (380:14) {#if isSortable && sortable !== false && isSortableOpposite}
    function create_if_block_25(ctx) {
    	let div;

    	return {
    		c() {
    			div = element("div");
    			attr(div, "class", "sortable-handler");
    		},
    		m(target, anchor) {
    			insert(target, div, anchor);
    		},
    		d(detaching) {
    			if (detaching) detach(div);
    		}
    	};
    }

    // (383:14) {#if hasMedia}
    function create_if_block_23(ctx) {
    	let div;
    	let t;
    	let current;
    	let if_block = typeof /*media*/ ctx[2] !== "undefined" && create_if_block_24(ctx);
    	const media_slot_template = /*$$slots*/ ctx[89].media;
    	const media_slot = create_slot(media_slot_template, ctx, /*$$scope*/ ctx[103], get_media_slot_context);

    	return {
    		c() {
    			div = element("div");
    			if (if_block) if_block.c();
    			t = space();
    			if (media_slot) media_slot.c();
    			attr(div, "class", "item-media");
    		},
    		m(target, anchor) {
    			insert(target, div, anchor);
    			if (if_block) if_block.m(div, null);
    			append(div, t);

    			if (media_slot) {
    				media_slot.m(div, null);
    			}

    			current = true;
    		},
    		p(ctx, dirty) {
    			if (typeof /*media*/ ctx[2] !== "undefined") {
    				if (if_block) {
    					if_block.p(ctx, dirty);
    				} else {
    					if_block = create_if_block_24(ctx);
    					if_block.c();
    					if_block.m(div, t);
    				}
    			} else if (if_block) {
    				if_block.d(1);
    				if_block = null;
    			}

    			if (media_slot) {
    				if (media_slot.p && dirty[3] & /*$$scope*/ 1024) {
    					media_slot.p(get_slot_context(media_slot_template, ctx, /*$$scope*/ ctx[103], get_media_slot_context), get_slot_changes(media_slot_template, /*$$scope*/ ctx[103], dirty, get_media_slot_changes));
    				}
    			}
    		},
    		i(local) {
    			if (current) return;
    			transition_in(media_slot, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(media_slot, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(div);
    			if (if_block) if_block.d();
    			if (media_slot) media_slot.d(detaching);
    		}
    	};
    }

    // (385:18) {#if typeof media !== 'undefined'}
    function create_if_block_24(ctx) {
    	let img;
    	let img_src_value;

    	return {
    		c() {
    			img = element("img");
    			if (img.src !== (img_src_value = /*media*/ ctx[2])) attr(img, "src", img_src_value);
    		},
    		m(target, anchor) {
    			insert(target, img, anchor);
    		},
    		p(ctx, dirty) {
    			if (dirty[0] & /*media*/ 4 && img.src !== (img_src_value = /*media*/ ctx[2])) {
    				attr(img, "src", img_src_value);
    			}
    		},
    		d(detaching) {
    			if (detaching) detach(img);
    		}
    	};
    }

    // (445:16) {:else}
    function create_else_block_1(ctx) {
    	let t0;
    	let t1;
    	let t2;
    	let t3;
    	let t4;
    	let if_block2_anchor;
    	let current;
    	const before_title_slot_template = /*$$slots*/ ctx[89]["before-title"];
    	const before_title_slot = create_slot(before_title_slot_template, ctx, /*$$scope*/ ctx[103], get_before_title_slot_context_1);
    	let if_block0 = (/*hasTitle*/ ctx[37] || /*hasHeader*/ ctx[38] || /*hasFooter*/ ctx[39]) && create_if_block_20(ctx);
    	const after_title_slot_template = /*$$slots*/ ctx[89]["after-title"];
    	const after_title_slot = create_slot(after_title_slot_template, ctx, /*$$scope*/ ctx[103], get_after_title_slot_context_1);
    	let if_block1 = /*hasAfter*/ ctx[42] && create_if_block_17(ctx);
    	const inner_slot_template = /*$$slots*/ ctx[89].inner;
    	const inner_slot = create_slot(inner_slot_template, ctx, /*$$scope*/ ctx[103], get_inner_slot_context_1);
    	let if_block2 = !(/*swipeout*/ ctx[11] || /*accordionItem*/ ctx[13]) && create_if_block_16(ctx);

    	return {
    		c() {
    			if (before_title_slot) before_title_slot.c();
    			t0 = space();
    			if (if_block0) if_block0.c();
    			t1 = space();
    			if (after_title_slot) after_title_slot.c();
    			t2 = space();
    			if (if_block1) if_block1.c();
    			t3 = space();
    			if (inner_slot) inner_slot.c();
    			t4 = space();
    			if (if_block2) if_block2.c();
    			if_block2_anchor = empty();
    		},
    		m(target, anchor) {
    			if (before_title_slot) {
    				before_title_slot.m(target, anchor);
    			}

    			insert(target, t0, anchor);
    			if (if_block0) if_block0.m(target, anchor);
    			insert(target, t1, anchor);

    			if (after_title_slot) {
    				after_title_slot.m(target, anchor);
    			}

    			insert(target, t2, anchor);
    			if (if_block1) if_block1.m(target, anchor);
    			insert(target, t3, anchor);

    			if (inner_slot) {
    				inner_slot.m(target, anchor);
    			}

    			insert(target, t4, anchor);
    			if (if_block2) if_block2.m(target, anchor);
    			insert(target, if_block2_anchor, anchor);
    			current = true;
    		},
    		p(ctx, dirty) {
    			if (before_title_slot) {
    				if (before_title_slot.p && dirty[3] & /*$$scope*/ 1024) {
    					before_title_slot.p(get_slot_context(before_title_slot_template, ctx, /*$$scope*/ ctx[103], get_before_title_slot_context_1), get_slot_changes(before_title_slot_template, /*$$scope*/ ctx[103], dirty, get_before_title_slot_changes_1));
    				}
    			}

    			if (/*hasTitle*/ ctx[37] || /*hasHeader*/ ctx[38] || /*hasFooter*/ ctx[39]) {
    				if (if_block0) {
    					if_block0.p(ctx, dirty);

    					if (dirty[1] & /*hasTitle, hasHeader, hasFooter*/ 448) {
    						transition_in(if_block0, 1);
    					}
    				} else {
    					if_block0 = create_if_block_20(ctx);
    					if_block0.c();
    					transition_in(if_block0, 1);
    					if_block0.m(t1.parentNode, t1);
    				}
    			} else if (if_block0) {
    				group_outros();

    				transition_out(if_block0, 1, 1, () => {
    					if_block0 = null;
    				});

    				check_outros();
    			}

    			if (after_title_slot) {
    				if (after_title_slot.p && dirty[3] & /*$$scope*/ 1024) {
    					after_title_slot.p(get_slot_context(after_title_slot_template, ctx, /*$$scope*/ ctx[103], get_after_title_slot_context_1), get_slot_changes(after_title_slot_template, /*$$scope*/ ctx[103], dirty, get_after_title_slot_changes_1));
    				}
    			}

    			if (/*hasAfter*/ ctx[42]) {
    				if (if_block1) {
    					if_block1.p(ctx, dirty);

    					if (dirty[1] & /*hasAfter*/ 2048) {
    						transition_in(if_block1, 1);
    					}
    				} else {
    					if_block1 = create_if_block_17(ctx);
    					if_block1.c();
    					transition_in(if_block1, 1);
    					if_block1.m(t3.parentNode, t3);
    				}
    			} else if (if_block1) {
    				group_outros();

    				transition_out(if_block1, 1, 1, () => {
    					if_block1 = null;
    				});

    				check_outros();
    			}

    			if (inner_slot) {
    				if (inner_slot.p && dirty[3] & /*$$scope*/ 1024) {
    					inner_slot.p(get_slot_context(inner_slot_template, ctx, /*$$scope*/ ctx[103], get_inner_slot_context_1), get_slot_changes(inner_slot_template, /*$$scope*/ ctx[103], dirty, get_inner_slot_changes_1));
    				}
    			}

    			if (!(/*swipeout*/ ctx[11] || /*accordionItem*/ ctx[13])) {
    				if (if_block2) {
    					if_block2.p(ctx, dirty);

    					if (dirty[0] & /*swipeout, accordionItem*/ 10240) {
    						transition_in(if_block2, 1);
    					}
    				} else {
    					if_block2 = create_if_block_16(ctx);
    					if_block2.c();
    					transition_in(if_block2, 1);
    					if_block2.m(if_block2_anchor.parentNode, if_block2_anchor);
    				}
    			} else if (if_block2) {
    				group_outros();

    				transition_out(if_block2, 1, 1, () => {
    					if_block2 = null;
    				});

    				check_outros();
    			}
    		},
    		i(local) {
    			if (current) return;
    			transition_in(before_title_slot, local);
    			transition_in(if_block0);
    			transition_in(after_title_slot, local);
    			transition_in(if_block1);
    			transition_in(inner_slot, local);
    			transition_in(if_block2);
    			current = true;
    		},
    		o(local) {
    			transition_out(before_title_slot, local);
    			transition_out(if_block0);
    			transition_out(after_title_slot, local);
    			transition_out(if_block1);
    			transition_out(inner_slot, local);
    			transition_out(if_block2);
    			current = false;
    		},
    		d(detaching) {
    			if (before_title_slot) before_title_slot.d(detaching);
    			if (detaching) detach(t0);
    			if (if_block0) if_block0.d(detaching);
    			if (detaching) detach(t1);
    			if (after_title_slot) after_title_slot.d(detaching);
    			if (detaching) detach(t2);
    			if (if_block1) if_block1.d(detaching);
    			if (detaching) detach(t3);
    			if (inner_slot) inner_slot.d(detaching);
    			if (detaching) detach(t4);
    			if (if_block2) if_block2.d(detaching);
    			if (detaching) detach(if_block2_anchor);
    		}
    	};
    }

    // (393:16) {#if isMedia}
    function create_if_block_6(ctx) {
    	let t0;
    	let div;
    	let t1;
    	let t2;
    	let t3;
    	let t4;
    	let t5;
    	let t6;
    	let t7;
    	let t8;
    	let if_block6_anchor;
    	let current;
    	let if_block0 = /*hasHeader*/ ctx[38] && create_if_block_15(ctx);
    	const before_title_slot_template = /*$$slots*/ ctx[89]["before-title"];
    	const before_title_slot = create_slot(before_title_slot_template, ctx, /*$$scope*/ ctx[103], get_before_title_slot_context);
    	let if_block1 = /*hasTitle*/ ctx[37] && create_if_block_14(ctx);
    	const after_title_slot_template = /*$$slots*/ ctx[89]["after-title"];
    	const after_title_slot = create_slot(after_title_slot_template, ctx, /*$$scope*/ ctx[103], get_after_title_slot_context);
    	let if_block2 = /*hasAfter*/ ctx[42] && create_if_block_11(ctx);
    	let if_block3 = /*hasSubtitle*/ ctx[40] && create_if_block_10(ctx);
    	let if_block4 = /*hasText*/ ctx[41] && create_if_block_9(ctx);
    	const inner_slot_template = /*$$slots*/ ctx[89].inner;
    	const inner_slot = create_slot(inner_slot_template, ctx, /*$$scope*/ ctx[103], get_inner_slot_context);
    	let if_block5 = !(/*swipeout*/ ctx[11] || /*accordionItem*/ ctx[13]) && create_if_block_8(ctx);
    	let if_block6 = /*hasFooter*/ ctx[39] && create_if_block_7(ctx);

    	return {
    		c() {
    			if (if_block0) if_block0.c();
    			t0 = space();
    			div = element("div");
    			if (before_title_slot) before_title_slot.c();
    			t1 = space();
    			if (if_block1) if_block1.c();
    			t2 = space();
    			if (after_title_slot) after_title_slot.c();
    			t3 = space();
    			if (if_block2) if_block2.c();
    			t4 = space();
    			if (if_block3) if_block3.c();
    			t5 = space();
    			if (if_block4) if_block4.c();
    			t6 = space();
    			if (inner_slot) inner_slot.c();
    			t7 = space();
    			if (if_block5) if_block5.c();
    			t8 = space();
    			if (if_block6) if_block6.c();
    			if_block6_anchor = empty();
    			attr(div, "class", "item-title-row");
    		},
    		m(target, anchor) {
    			if (if_block0) if_block0.m(target, anchor);
    			insert(target, t0, anchor);
    			insert(target, div, anchor);

    			if (before_title_slot) {
    				before_title_slot.m(div, null);
    			}

    			append(div, t1);
    			if (if_block1) if_block1.m(div, null);
    			append(div, t2);

    			if (after_title_slot) {
    				after_title_slot.m(div, null);
    			}

    			append(div, t3);
    			if (if_block2) if_block2.m(div, null);
    			insert(target, t4, anchor);
    			if (if_block3) if_block3.m(target, anchor);
    			insert(target, t5, anchor);
    			if (if_block4) if_block4.m(target, anchor);
    			insert(target, t6, anchor);

    			if (inner_slot) {
    				inner_slot.m(target, anchor);
    			}

    			insert(target, t7, anchor);
    			if (if_block5) if_block5.m(target, anchor);
    			insert(target, t8, anchor);
    			if (if_block6) if_block6.m(target, anchor);
    			insert(target, if_block6_anchor, anchor);
    			current = true;
    		},
    		p(ctx, dirty) {
    			if (/*hasHeader*/ ctx[38]) {
    				if (if_block0) {
    					if_block0.p(ctx, dirty);

    					if (dirty[1] & /*hasHeader*/ 128) {
    						transition_in(if_block0, 1);
    					}
    				} else {
    					if_block0 = create_if_block_15(ctx);
    					if_block0.c();
    					transition_in(if_block0, 1);
    					if_block0.m(t0.parentNode, t0);
    				}
    			} else if (if_block0) {
    				group_outros();

    				transition_out(if_block0, 1, 1, () => {
    					if_block0 = null;
    				});

    				check_outros();
    			}

    			if (before_title_slot) {
    				if (before_title_slot.p && dirty[3] & /*$$scope*/ 1024) {
    					before_title_slot.p(get_slot_context(before_title_slot_template, ctx, /*$$scope*/ ctx[103], get_before_title_slot_context), get_slot_changes(before_title_slot_template, /*$$scope*/ ctx[103], dirty, get_before_title_slot_changes));
    				}
    			}

    			if (/*hasTitle*/ ctx[37]) {
    				if (if_block1) {
    					if_block1.p(ctx, dirty);

    					if (dirty[1] & /*hasTitle*/ 64) {
    						transition_in(if_block1, 1);
    					}
    				} else {
    					if_block1 = create_if_block_14(ctx);
    					if_block1.c();
    					transition_in(if_block1, 1);
    					if_block1.m(div, t2);
    				}
    			} else if (if_block1) {
    				group_outros();

    				transition_out(if_block1, 1, 1, () => {
    					if_block1 = null;
    				});

    				check_outros();
    			}

    			if (after_title_slot) {
    				if (after_title_slot.p && dirty[3] & /*$$scope*/ 1024) {
    					after_title_slot.p(get_slot_context(after_title_slot_template, ctx, /*$$scope*/ ctx[103], get_after_title_slot_context), get_slot_changes(after_title_slot_template, /*$$scope*/ ctx[103], dirty, get_after_title_slot_changes));
    				}
    			}

    			if (/*hasAfter*/ ctx[42]) {
    				if (if_block2) {
    					if_block2.p(ctx, dirty);

    					if (dirty[1] & /*hasAfter*/ 2048) {
    						transition_in(if_block2, 1);
    					}
    				} else {
    					if_block2 = create_if_block_11(ctx);
    					if_block2.c();
    					transition_in(if_block2, 1);
    					if_block2.m(div, null);
    				}
    			} else if (if_block2) {
    				group_outros();

    				transition_out(if_block2, 1, 1, () => {
    					if_block2 = null;
    				});

    				check_outros();
    			}

    			if (/*hasSubtitle*/ ctx[40]) {
    				if (if_block3) {
    					if_block3.p(ctx, dirty);

    					if (dirty[1] & /*hasSubtitle*/ 512) {
    						transition_in(if_block3, 1);
    					}
    				} else {
    					if_block3 = create_if_block_10(ctx);
    					if_block3.c();
    					transition_in(if_block3, 1);
    					if_block3.m(t5.parentNode, t5);
    				}
    			} else if (if_block3) {
    				group_outros();

    				transition_out(if_block3, 1, 1, () => {
    					if_block3 = null;
    				});

    				check_outros();
    			}

    			if (/*hasText*/ ctx[41]) {
    				if (if_block4) {
    					if_block4.p(ctx, dirty);

    					if (dirty[1] & /*hasText*/ 1024) {
    						transition_in(if_block4, 1);
    					}
    				} else {
    					if_block4 = create_if_block_9(ctx);
    					if_block4.c();
    					transition_in(if_block4, 1);
    					if_block4.m(t6.parentNode, t6);
    				}
    			} else if (if_block4) {
    				group_outros();

    				transition_out(if_block4, 1, 1, () => {
    					if_block4 = null;
    				});

    				check_outros();
    			}

    			if (inner_slot) {
    				if (inner_slot.p && dirty[3] & /*$$scope*/ 1024) {
    					inner_slot.p(get_slot_context(inner_slot_template, ctx, /*$$scope*/ ctx[103], get_inner_slot_context), get_slot_changes(inner_slot_template, /*$$scope*/ ctx[103], dirty, get_inner_slot_changes));
    				}
    			}

    			if (!(/*swipeout*/ ctx[11] || /*accordionItem*/ ctx[13])) {
    				if (if_block5) {
    					if_block5.p(ctx, dirty);

    					if (dirty[0] & /*swipeout, accordionItem*/ 10240) {
    						transition_in(if_block5, 1);
    					}
    				} else {
    					if_block5 = create_if_block_8(ctx);
    					if_block5.c();
    					transition_in(if_block5, 1);
    					if_block5.m(t8.parentNode, t8);
    				}
    			} else if (if_block5) {
    				group_outros();

    				transition_out(if_block5, 1, 1, () => {
    					if_block5 = null;
    				});

    				check_outros();
    			}

    			if (/*hasFooter*/ ctx[39]) {
    				if (if_block6) {
    					if_block6.p(ctx, dirty);

    					if (dirty[1] & /*hasFooter*/ 256) {
    						transition_in(if_block6, 1);
    					}
    				} else {
    					if_block6 = create_if_block_7(ctx);
    					if_block6.c();
    					transition_in(if_block6, 1);
    					if_block6.m(if_block6_anchor.parentNode, if_block6_anchor);
    				}
    			} else if (if_block6) {
    				group_outros();

    				transition_out(if_block6, 1, 1, () => {
    					if_block6 = null;
    				});

    				check_outros();
    			}
    		},
    		i(local) {
    			if (current) return;
    			transition_in(if_block0);
    			transition_in(before_title_slot, local);
    			transition_in(if_block1);
    			transition_in(after_title_slot, local);
    			transition_in(if_block2);
    			transition_in(if_block3);
    			transition_in(if_block4);
    			transition_in(inner_slot, local);
    			transition_in(if_block5);
    			transition_in(if_block6);
    			current = true;
    		},
    		o(local) {
    			transition_out(if_block0);
    			transition_out(before_title_slot, local);
    			transition_out(if_block1);
    			transition_out(after_title_slot, local);
    			transition_out(if_block2);
    			transition_out(if_block3);
    			transition_out(if_block4);
    			transition_out(inner_slot, local);
    			transition_out(if_block5);
    			transition_out(if_block6);
    			current = false;
    		},
    		d(detaching) {
    			if (if_block0) if_block0.d(detaching);
    			if (detaching) detach(t0);
    			if (detaching) detach(div);
    			if (before_title_slot) before_title_slot.d(detaching);
    			if (if_block1) if_block1.d();
    			if (after_title_slot) after_title_slot.d(detaching);
    			if (if_block2) if_block2.d();
    			if (detaching) detach(t4);
    			if (if_block3) if_block3.d(detaching);
    			if (detaching) detach(t5);
    			if (if_block4) if_block4.d(detaching);
    			if (detaching) detach(t6);
    			if (inner_slot) inner_slot.d(detaching);
    			if (detaching) detach(t7);
    			if (if_block5) if_block5.d(detaching);
    			if (detaching) detach(t8);
    			if (if_block6) if_block6.d(detaching);
    			if (detaching) detach(if_block6_anchor);
    		}
    	};
    }

    // (447:18) {#if (hasTitle || hasHeader || hasFooter)}
    function create_if_block_20(ctx) {
    	let div;
    	let t0;
    	let t1_value = Utils.text(/*title*/ ctx[0]) + "";
    	let t1;
    	let t2;
    	let t3;
    	let current;
    	let if_block0 = /*hasHeader*/ ctx[38] && create_if_block_22(ctx);
    	const title_slot_template = /*$$slots*/ ctx[89].title;
    	const title_slot = create_slot(title_slot_template, ctx, /*$$scope*/ ctx[103], get_title_slot_context_1);
    	let if_block1 = /*hasFooter*/ ctx[39] && create_if_block_21(ctx);

    	return {
    		c() {
    			div = element("div");
    			if (if_block0) if_block0.c();
    			t0 = space();
    			t1 = text(t1_value);
    			t2 = space();
    			if (title_slot) title_slot.c();
    			t3 = space();
    			if (if_block1) if_block1.c();
    			attr(div, "class", "item-title");
    		},
    		m(target, anchor) {
    			insert(target, div, anchor);
    			if (if_block0) if_block0.m(div, null);
    			append(div, t0);
    			append(div, t1);
    			append(div, t2);

    			if (title_slot) {
    				title_slot.m(div, null);
    			}

    			append(div, t3);
    			if (if_block1) if_block1.m(div, null);
    			current = true;
    		},
    		p(ctx, dirty) {
    			if (/*hasHeader*/ ctx[38]) {
    				if (if_block0) {
    					if_block0.p(ctx, dirty);

    					if (dirty[1] & /*hasHeader*/ 128) {
    						transition_in(if_block0, 1);
    					}
    				} else {
    					if_block0 = create_if_block_22(ctx);
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

    			if ((!current || dirty[0] & /*title*/ 1) && t1_value !== (t1_value = Utils.text(/*title*/ ctx[0]) + "")) set_data(t1, t1_value);

    			if (title_slot) {
    				if (title_slot.p && dirty[3] & /*$$scope*/ 1024) {
    					title_slot.p(get_slot_context(title_slot_template, ctx, /*$$scope*/ ctx[103], get_title_slot_context_1), get_slot_changes(title_slot_template, /*$$scope*/ ctx[103], dirty, get_title_slot_changes_1));
    				}
    			}

    			if (/*hasFooter*/ ctx[39]) {
    				if (if_block1) {
    					if_block1.p(ctx, dirty);

    					if (dirty[1] & /*hasFooter*/ 256) {
    						transition_in(if_block1, 1);
    					}
    				} else {
    					if_block1 = create_if_block_21(ctx);
    					if_block1.c();
    					transition_in(if_block1, 1);
    					if_block1.m(div, null);
    				}
    			} else if (if_block1) {
    				group_outros();

    				transition_out(if_block1, 1, 1, () => {
    					if_block1 = null;
    				});

    				check_outros();
    			}
    		},
    		i(local) {
    			if (current) return;
    			transition_in(if_block0);
    			transition_in(title_slot, local);
    			transition_in(if_block1);
    			current = true;
    		},
    		o(local) {
    			transition_out(if_block0);
    			transition_out(title_slot, local);
    			transition_out(if_block1);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(div);
    			if (if_block0) if_block0.d();
    			if (title_slot) title_slot.d(detaching);
    			if (if_block1) if_block1.d();
    		}
    	};
    }

    // (449:22) {#if hasHeader}
    function create_if_block_22(ctx) {
    	let div;
    	let t0_value = Utils.text(/*header*/ ctx[4]) + "";
    	let t0;
    	let t1;
    	let current;
    	const header_slot_template = /*$$slots*/ ctx[89].header;
    	const header_slot = create_slot(header_slot_template, ctx, /*$$scope*/ ctx[103], get_header_slot_context_1);

    	return {
    		c() {
    			div = element("div");
    			t0 = text(t0_value);
    			t1 = space();
    			if (header_slot) header_slot.c();
    			attr(div, "class", "item-header");
    		},
    		m(target, anchor) {
    			insert(target, div, anchor);
    			append(div, t0);
    			append(div, t1);

    			if (header_slot) {
    				header_slot.m(div, null);
    			}

    			current = true;
    		},
    		p(ctx, dirty) {
    			if ((!current || dirty[0] & /*header*/ 16) && t0_value !== (t0_value = Utils.text(/*header*/ ctx[4]) + "")) set_data(t0, t0_value);

    			if (header_slot) {
    				if (header_slot.p && dirty[3] & /*$$scope*/ 1024) {
    					header_slot.p(get_slot_context(header_slot_template, ctx, /*$$scope*/ ctx[103], get_header_slot_context_1), get_slot_changes(header_slot_template, /*$$scope*/ ctx[103], dirty, get_header_slot_changes_1));
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
    		}
    	};
    }

    // (457:22) {#if hasFooter}
    function create_if_block_21(ctx) {
    	let div;
    	let t0_value = Utils.text(/*footer*/ ctx[5]) + "";
    	let t0;
    	let t1;
    	let current;
    	const footer_slot_template = /*$$slots*/ ctx[89].footer;
    	const footer_slot = create_slot(footer_slot_template, ctx, /*$$scope*/ ctx[103], get_footer_slot_context_1);

    	return {
    		c() {
    			div = element("div");
    			t0 = text(t0_value);
    			t1 = space();
    			if (footer_slot) footer_slot.c();
    			attr(div, "class", "item-footer");
    		},
    		m(target, anchor) {
    			insert(target, div, anchor);
    			append(div, t0);
    			append(div, t1);

    			if (footer_slot) {
    				footer_slot.m(div, null);
    			}

    			current = true;
    		},
    		p(ctx, dirty) {
    			if ((!current || dirty[0] & /*footer*/ 32) && t0_value !== (t0_value = Utils.text(/*footer*/ ctx[5]) + "")) set_data(t0, t0_value);

    			if (footer_slot) {
    				if (footer_slot.p && dirty[3] & /*$$scope*/ 1024) {
    					footer_slot.p(get_slot_context(footer_slot_template, ctx, /*$$scope*/ ctx[103], get_footer_slot_context_1), get_slot_changes(footer_slot_template, /*$$scope*/ ctx[103], dirty, get_footer_slot_changes_1));
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
    		}
    	};
    }

    // (466:18) {#if hasAfter}
    function create_if_block_17(ctx) {
    	let div;
    	let t0;
    	let t1;
    	let t2;
    	let t3;
    	let current;
    	const after_start_slot_template = /*$$slots*/ ctx[89]["after-start"];
    	const after_start_slot = create_slot(after_start_slot_template, ctx, /*$$scope*/ ctx[103], get_after_start_slot_context_1);
    	let if_block0 = typeof /*after*/ ctx[6] !== "undefined" && create_if_block_19(ctx);
    	let if_block1 = typeof /*badge*/ ctx[7] !== "undefined" && create_if_block_18(ctx);
    	const after_slot_template = /*$$slots*/ ctx[89].after;
    	const after_slot = create_slot(after_slot_template, ctx, /*$$scope*/ ctx[103], get_after_slot_context_1);
    	const after_end_slot_template = /*$$slots*/ ctx[89]["after-end"];
    	const after_end_slot = create_slot(after_end_slot_template, ctx, /*$$scope*/ ctx[103], get_after_end_slot_context_1);

    	return {
    		c() {
    			div = element("div");
    			if (after_start_slot) after_start_slot.c();
    			t0 = space();
    			if (if_block0) if_block0.c();
    			t1 = space();
    			if (if_block1) if_block1.c();
    			t2 = space();
    			if (after_slot) after_slot.c();
    			t3 = space();
    			if (after_end_slot) after_end_slot.c();
    			attr(div, "class", "item-after");
    		},
    		m(target, anchor) {
    			insert(target, div, anchor);

    			if (after_start_slot) {
    				after_start_slot.m(div, null);
    			}

    			append(div, t0);
    			if (if_block0) if_block0.m(div, null);
    			append(div, t1);
    			if (if_block1) if_block1.m(div, null);
    			append(div, t2);

    			if (after_slot) {
    				after_slot.m(div, null);
    			}

    			append(div, t3);

    			if (after_end_slot) {
    				after_end_slot.m(div, null);
    			}

    			current = true;
    		},
    		p(ctx, dirty) {
    			if (after_start_slot) {
    				if (after_start_slot.p && dirty[3] & /*$$scope*/ 1024) {
    					after_start_slot.p(get_slot_context(after_start_slot_template, ctx, /*$$scope*/ ctx[103], get_after_start_slot_context_1), get_slot_changes(after_start_slot_template, /*$$scope*/ ctx[103], dirty, get_after_start_slot_changes_1));
    				}
    			}

    			if (typeof /*after*/ ctx[6] !== "undefined") {
    				if (if_block0) {
    					if_block0.p(ctx, dirty);
    				} else {
    					if_block0 = create_if_block_19(ctx);
    					if_block0.c();
    					if_block0.m(div, t1);
    				}
    			} else if (if_block0) {
    				if_block0.d(1);
    				if_block0 = null;
    			}

    			if (typeof /*badge*/ ctx[7] !== "undefined") {
    				if (if_block1) {
    					if_block1.p(ctx, dirty);

    					if (dirty[0] & /*badge*/ 128) {
    						transition_in(if_block1, 1);
    					}
    				} else {
    					if_block1 = create_if_block_18(ctx);
    					if_block1.c();
    					transition_in(if_block1, 1);
    					if_block1.m(div, t2);
    				}
    			} else if (if_block1) {
    				group_outros();

    				transition_out(if_block1, 1, 1, () => {
    					if_block1 = null;
    				});

    				check_outros();
    			}

    			if (after_slot) {
    				if (after_slot.p && dirty[3] & /*$$scope*/ 1024) {
    					after_slot.p(get_slot_context(after_slot_template, ctx, /*$$scope*/ ctx[103], get_after_slot_context_1), get_slot_changes(after_slot_template, /*$$scope*/ ctx[103], dirty, get_after_slot_changes_1));
    				}
    			}

    			if (after_end_slot) {
    				if (after_end_slot.p && dirty[3] & /*$$scope*/ 1024) {
    					after_end_slot.p(get_slot_context(after_end_slot_template, ctx, /*$$scope*/ ctx[103], get_after_end_slot_context_1), get_slot_changes(after_end_slot_template, /*$$scope*/ ctx[103], dirty, get_after_end_slot_changes_1));
    				}
    			}
    		},
    		i(local) {
    			if (current) return;
    			transition_in(after_start_slot, local);
    			transition_in(if_block1);
    			transition_in(after_slot, local);
    			transition_in(after_end_slot, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(after_start_slot, local);
    			transition_out(if_block1);
    			transition_out(after_slot, local);
    			transition_out(after_end_slot, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(div);
    			if (after_start_slot) after_start_slot.d(detaching);
    			if (if_block0) if_block0.d();
    			if (if_block1) if_block1.d();
    			if (after_slot) after_slot.d(detaching);
    			if (after_end_slot) after_end_slot.d(detaching);
    		}
    	};
    }

    // (469:22) {#if typeof after !== 'undefined'}
    function create_if_block_19(ctx) {
    	let span;
    	let t_value = Utils.text(/*after*/ ctx[6]) + "";
    	let t;

    	return {
    		c() {
    			span = element("span");
    			t = text(t_value);
    		},
    		m(target, anchor) {
    			insert(target, span, anchor);
    			append(span, t);
    		},
    		p(ctx, dirty) {
    			if (dirty[0] & /*after*/ 64 && t_value !== (t_value = Utils.text(/*after*/ ctx[6]) + "")) set_data(t, t_value);
    		},
    		d(detaching) {
    			if (detaching) detach(span);
    		}
    	};
    }

    // (472:22) {#if typeof badge !== 'undefined'}
    function create_if_block_18(ctx) {
    	let current;

    	const badge_1 = new Badge({
    			props: {
    				color: /*badgeColor*/ ctx[8],
    				$$slots: { default: [create_default_slot_1$2] },
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
    			if (dirty[0] & /*badgeColor*/ 256) badge_1_changes.color = /*badgeColor*/ ctx[8];

    			if (dirty[0] & /*badge*/ 128 | dirty[3] & /*$$scope*/ 1024) {
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

    // (473:24) <Badge color={badgeColor}>
    function create_default_slot_1$2(ctx) {
    	let t_value = Utils.text(/*badge*/ ctx[7]) + "";
    	let t;

    	return {
    		c() {
    			t = text(t_value);
    		},
    		m(target, anchor) {
    			insert(target, t, anchor);
    		},
    		p(ctx, dirty) {
    			if (dirty[0] & /*badge*/ 128 && t_value !== (t_value = Utils.text(/*badge*/ ctx[7]) + "")) set_data(t, t_value);
    		},
    		d(detaching) {
    			if (detaching) detach(t);
    		}
    	};
    }

    // (480:18) {#if !(swipeout || accordionItem)}
    function create_if_block_16(ctx) {
    	let current;
    	const default_slot_template = /*$$slots*/ ctx[89].default;
    	const default_slot = create_slot(default_slot_template, ctx, /*$$scope*/ ctx[103], null);

    	return {
    		c() {
    			if (default_slot) default_slot.c();
    		},
    		m(target, anchor) {
    			if (default_slot) {
    				default_slot.m(target, anchor);
    			}

    			current = true;
    		},
    		p(ctx, dirty) {
    			if (default_slot) {
    				if (default_slot.p && dirty[3] & /*$$scope*/ 1024) {
    					default_slot.p(get_slot_context(default_slot_template, ctx, /*$$scope*/ ctx[103], null), get_slot_changes(default_slot_template, /*$$scope*/ ctx[103], dirty, null));
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
    			if (default_slot) default_slot.d(detaching);
    		}
    	};
    }

    // (394:18) {#if hasHeader}
    function create_if_block_15(ctx) {
    	let div;
    	let t0_value = Utils.text(/*header*/ ctx[4]) + "";
    	let t0;
    	let t1;
    	let current;
    	const header_slot_template = /*$$slots*/ ctx[89].header;
    	const header_slot = create_slot(header_slot_template, ctx, /*$$scope*/ ctx[103], get_header_slot_context$1);

    	return {
    		c() {
    			div = element("div");
    			t0 = text(t0_value);
    			t1 = space();
    			if (header_slot) header_slot.c();
    			attr(div, "class", "item-header");
    		},
    		m(target, anchor) {
    			insert(target, div, anchor);
    			append(div, t0);
    			append(div, t1);

    			if (header_slot) {
    				header_slot.m(div, null);
    			}

    			current = true;
    		},
    		p(ctx, dirty) {
    			if ((!current || dirty[0] & /*header*/ 16) && t0_value !== (t0_value = Utils.text(/*header*/ ctx[4]) + "")) set_data(t0, t0_value);

    			if (header_slot) {
    				if (header_slot.p && dirty[3] & /*$$scope*/ 1024) {
    					header_slot.p(get_slot_context(header_slot_template, ctx, /*$$scope*/ ctx[103], get_header_slot_context$1), get_slot_changes(header_slot_template, /*$$scope*/ ctx[103], dirty, get_header_slot_changes$1));
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
    		}
    	};
    }

    // (402:20) {#if (hasTitle)}
    function create_if_block_14(ctx) {
    	let div;
    	let t0_value = Utils.text(/*title*/ ctx[0]) + "";
    	let t0;
    	let t1;
    	let current;
    	const title_slot_template = /*$$slots*/ ctx[89].title;
    	const title_slot = create_slot(title_slot_template, ctx, /*$$scope*/ ctx[103], get_title_slot_context);

    	return {
    		c() {
    			div = element("div");
    			t0 = text(t0_value);
    			t1 = space();
    			if (title_slot) title_slot.c();
    			attr(div, "class", "item-title");
    		},
    		m(target, anchor) {
    			insert(target, div, anchor);
    			append(div, t0);
    			append(div, t1);

    			if (title_slot) {
    				title_slot.m(div, null);
    			}

    			current = true;
    		},
    		p(ctx, dirty) {
    			if ((!current || dirty[0] & /*title*/ 1) && t0_value !== (t0_value = Utils.text(/*title*/ ctx[0]) + "")) set_data(t0, t0_value);

    			if (title_slot) {
    				if (title_slot.p && dirty[3] & /*$$scope*/ 1024) {
    					title_slot.p(get_slot_context(title_slot_template, ctx, /*$$scope*/ ctx[103], get_title_slot_context), get_slot_changes(title_slot_template, /*$$scope*/ ctx[103], dirty, get_title_slot_changes));
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
    			if (detaching) detach(div);
    			if (title_slot) title_slot.d(detaching);
    		}
    	};
    }

    // (409:20) {#if hasAfter}
    function create_if_block_11(ctx) {
    	let div;
    	let t0;
    	let t1;
    	let t2;
    	let t3;
    	let current;
    	const after_start_slot_template = /*$$slots*/ ctx[89]["after-start"];
    	const after_start_slot = create_slot(after_start_slot_template, ctx, /*$$scope*/ ctx[103], get_after_start_slot_context);
    	let if_block0 = typeof /*after*/ ctx[6] !== "undefined" && create_if_block_13(ctx);
    	let if_block1 = typeof /*badge*/ ctx[7] !== "undefined" && create_if_block_12(ctx);
    	const after_slot_template = /*$$slots*/ ctx[89].after;
    	const after_slot = create_slot(after_slot_template, ctx, /*$$scope*/ ctx[103], get_after_slot_context);
    	const after_end_slot_template = /*$$slots*/ ctx[89]["after-end"];
    	const after_end_slot = create_slot(after_end_slot_template, ctx, /*$$scope*/ ctx[103], get_after_end_slot_context);

    	return {
    		c() {
    			div = element("div");
    			if (after_start_slot) after_start_slot.c();
    			t0 = space();
    			if (if_block0) if_block0.c();
    			t1 = space();
    			if (if_block1) if_block1.c();
    			t2 = space();
    			if (after_slot) after_slot.c();
    			t3 = space();
    			if (after_end_slot) after_end_slot.c();
    			attr(div, "class", "item-after");
    		},
    		m(target, anchor) {
    			insert(target, div, anchor);

    			if (after_start_slot) {
    				after_start_slot.m(div, null);
    			}

    			append(div, t0);
    			if (if_block0) if_block0.m(div, null);
    			append(div, t1);
    			if (if_block1) if_block1.m(div, null);
    			append(div, t2);

    			if (after_slot) {
    				after_slot.m(div, null);
    			}

    			append(div, t3);

    			if (after_end_slot) {
    				after_end_slot.m(div, null);
    			}

    			current = true;
    		},
    		p(ctx, dirty) {
    			if (after_start_slot) {
    				if (after_start_slot.p && dirty[3] & /*$$scope*/ 1024) {
    					after_start_slot.p(get_slot_context(after_start_slot_template, ctx, /*$$scope*/ ctx[103], get_after_start_slot_context), get_slot_changes(after_start_slot_template, /*$$scope*/ ctx[103], dirty, get_after_start_slot_changes));
    				}
    			}

    			if (typeof /*after*/ ctx[6] !== "undefined") {
    				if (if_block0) {
    					if_block0.p(ctx, dirty);
    				} else {
    					if_block0 = create_if_block_13(ctx);
    					if_block0.c();
    					if_block0.m(div, t1);
    				}
    			} else if (if_block0) {
    				if_block0.d(1);
    				if_block0 = null;
    			}

    			if (typeof /*badge*/ ctx[7] !== "undefined") {
    				if (if_block1) {
    					if_block1.p(ctx, dirty);

    					if (dirty[0] & /*badge*/ 128) {
    						transition_in(if_block1, 1);
    					}
    				} else {
    					if_block1 = create_if_block_12(ctx);
    					if_block1.c();
    					transition_in(if_block1, 1);
    					if_block1.m(div, t2);
    				}
    			} else if (if_block1) {
    				group_outros();

    				transition_out(if_block1, 1, 1, () => {
    					if_block1 = null;
    				});

    				check_outros();
    			}

    			if (after_slot) {
    				if (after_slot.p && dirty[3] & /*$$scope*/ 1024) {
    					after_slot.p(get_slot_context(after_slot_template, ctx, /*$$scope*/ ctx[103], get_after_slot_context), get_slot_changes(after_slot_template, /*$$scope*/ ctx[103], dirty, get_after_slot_changes));
    				}
    			}

    			if (after_end_slot) {
    				if (after_end_slot.p && dirty[3] & /*$$scope*/ 1024) {
    					after_end_slot.p(get_slot_context(after_end_slot_template, ctx, /*$$scope*/ ctx[103], get_after_end_slot_context), get_slot_changes(after_end_slot_template, /*$$scope*/ ctx[103], dirty, get_after_end_slot_changes));
    				}
    			}
    		},
    		i(local) {
    			if (current) return;
    			transition_in(after_start_slot, local);
    			transition_in(if_block1);
    			transition_in(after_slot, local);
    			transition_in(after_end_slot, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(after_start_slot, local);
    			transition_out(if_block1);
    			transition_out(after_slot, local);
    			transition_out(after_end_slot, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(div);
    			if (after_start_slot) after_start_slot.d(detaching);
    			if (if_block0) if_block0.d();
    			if (if_block1) if_block1.d();
    			if (after_slot) after_slot.d(detaching);
    			if (after_end_slot) after_end_slot.d(detaching);
    		}
    	};
    }

    // (412:24) {#if typeof after !== 'undefined'}
    function create_if_block_13(ctx) {
    	let span;
    	let t_value = Utils.text(/*after*/ ctx[6]) + "";
    	let t;

    	return {
    		c() {
    			span = element("span");
    			t = text(t_value);
    		},
    		m(target, anchor) {
    			insert(target, span, anchor);
    			append(span, t);
    		},
    		p(ctx, dirty) {
    			if (dirty[0] & /*after*/ 64 && t_value !== (t_value = Utils.text(/*after*/ ctx[6]) + "")) set_data(t, t_value);
    		},
    		d(detaching) {
    			if (detaching) detach(span);
    		}
    	};
    }

    // (415:24) {#if typeof badge !== 'undefined'}
    function create_if_block_12(ctx) {
    	let current;

    	const badge_1 = new Badge({
    			props: {
    				color: /*badgeColor*/ ctx[8],
    				$$slots: { default: [create_default_slot$2] },
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
    			if (dirty[0] & /*badgeColor*/ 256) badge_1_changes.color = /*badgeColor*/ ctx[8];

    			if (dirty[0] & /*badge*/ 128 | dirty[3] & /*$$scope*/ 1024) {
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

    // (416:26) <Badge color={badgeColor}>
    function create_default_slot$2(ctx) {
    	let t_value = Utils.text(/*badge*/ ctx[7]) + "";
    	let t;

    	return {
    		c() {
    			t = text(t_value);
    		},
    		m(target, anchor) {
    			insert(target, t, anchor);
    		},
    		p(ctx, dirty) {
    			if (dirty[0] & /*badge*/ 128 && t_value !== (t_value = Utils.text(/*badge*/ ctx[7]) + "")) set_data(t, t_value);
    		},
    		d(detaching) {
    			if (detaching) detach(t);
    		}
    	};
    }

    // (423:18) {#if hasSubtitle}
    function create_if_block_10(ctx) {
    	let div;
    	let t0_value = Utils.text(/*subtitle*/ ctx[3]) + "";
    	let t0;
    	let t1;
    	let current;
    	const subtitle_slot_template = /*$$slots*/ ctx[89].subtitle;
    	const subtitle_slot = create_slot(subtitle_slot_template, ctx, /*$$scope*/ ctx[103], get_subtitle_slot_context);

    	return {
    		c() {
    			div = element("div");
    			t0 = text(t0_value);
    			t1 = space();
    			if (subtitle_slot) subtitle_slot.c();
    			attr(div, "class", "item-subtitle");
    		},
    		m(target, anchor) {
    			insert(target, div, anchor);
    			append(div, t0);
    			append(div, t1);

    			if (subtitle_slot) {
    				subtitle_slot.m(div, null);
    			}

    			current = true;
    		},
    		p(ctx, dirty) {
    			if ((!current || dirty[0] & /*subtitle*/ 8) && t0_value !== (t0_value = Utils.text(/*subtitle*/ ctx[3]) + "")) set_data(t0, t0_value);

    			if (subtitle_slot) {
    				if (subtitle_slot.p && dirty[3] & /*$$scope*/ 1024) {
    					subtitle_slot.p(get_slot_context(subtitle_slot_template, ctx, /*$$scope*/ ctx[103], get_subtitle_slot_context), get_slot_changes(subtitle_slot_template, /*$$scope*/ ctx[103], dirty, get_subtitle_slot_changes));
    				}
    			}
    		},
    		i(local) {
    			if (current) return;
    			transition_in(subtitle_slot, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(subtitle_slot, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(div);
    			if (subtitle_slot) subtitle_slot.d(detaching);
    		}
    	};
    }

    // (429:18) {#if hasText}
    function create_if_block_9(ctx) {
    	let div;
    	let t0_value = Utils.text(/*text*/ ctx[1]) + "";
    	let t0;
    	let t1;
    	let current;
    	const text_slot_template = /*$$slots*/ ctx[89].text;
    	const text_slot = create_slot(text_slot_template, ctx, /*$$scope*/ ctx[103], get_text_slot_context);

    	return {
    		c() {
    			div = element("div");
    			t0 = text(t0_value);
    			t1 = space();
    			if (text_slot) text_slot.c();
    			attr(div, "class", "item-text");
    		},
    		m(target, anchor) {
    			insert(target, div, anchor);
    			append(div, t0);
    			append(div, t1);

    			if (text_slot) {
    				text_slot.m(div, null);
    			}

    			current = true;
    		},
    		p(ctx, dirty) {
    			if ((!current || dirty[0] & /*text*/ 2) && t0_value !== (t0_value = Utils.text(/*text*/ ctx[1]) + "")) set_data(t0, t0_value);

    			if (text_slot) {
    				if (text_slot.p && dirty[3] & /*$$scope*/ 1024) {
    					text_slot.p(get_slot_context(text_slot_template, ctx, /*$$scope*/ ctx[103], get_text_slot_context), get_slot_changes(text_slot_template, /*$$scope*/ ctx[103], dirty, get_text_slot_changes));
    				}
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
    			if (text_slot) text_slot.d(detaching);
    		}
    	};
    }

    // (436:18) {#if !(swipeout || accordionItem)}
    function create_if_block_8(ctx) {
    	let current;
    	const default_slot_template = /*$$slots*/ ctx[89].default;
    	const default_slot = create_slot(default_slot_template, ctx, /*$$scope*/ ctx[103], null);

    	return {
    		c() {
    			if (default_slot) default_slot.c();
    		},
    		m(target, anchor) {
    			if (default_slot) {
    				default_slot.m(target, anchor);
    			}

    			current = true;
    		},
    		p(ctx, dirty) {
    			if (default_slot) {
    				if (default_slot.p && dirty[3] & /*$$scope*/ 1024) {
    					default_slot.p(get_slot_context(default_slot_template, ctx, /*$$scope*/ ctx[103], null), get_slot_changes(default_slot_template, /*$$scope*/ ctx[103], dirty, null));
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
    			if (default_slot) default_slot.d(detaching);
    		}
    	};
    }

    // (439:18) {#if hasFooter}
    function create_if_block_7(ctx) {
    	let div;
    	let t0_value = Utils.text(/*footer*/ ctx[5]) + "";
    	let t0;
    	let t1;
    	let current;
    	const footer_slot_template = /*$$slots*/ ctx[89].footer;
    	const footer_slot = create_slot(footer_slot_template, ctx, /*$$scope*/ ctx[103], get_footer_slot_context$1);

    	return {
    		c() {
    			div = element("div");
    			t0 = text(t0_value);
    			t1 = space();
    			if (footer_slot) footer_slot.c();
    			attr(div, "class", "item-footer");
    		},
    		m(target, anchor) {
    			insert(target, div, anchor);
    			append(div, t0);
    			append(div, t1);

    			if (footer_slot) {
    				footer_slot.m(div, null);
    			}

    			current = true;
    		},
    		p(ctx, dirty) {
    			if ((!current || dirty[0] & /*footer*/ 32) && t0_value !== (t0_value = Utils.text(/*footer*/ ctx[5]) + "")) set_data(t0, t0_value);

    			if (footer_slot) {
    				if (footer_slot.p && dirty[3] & /*$$scope*/ 1024) {
    					footer_slot.p(get_slot_context(footer_slot_template, ctx, /*$$scope*/ ctx[103], get_footer_slot_context$1), get_slot_changes(footer_slot_template, /*$$scope*/ ctx[103], dirty, get_footer_slot_changes$1));
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
    		}
    	};
    }

    // (1092:4) {#if (isSortable && sortable !== false && !isSortableOpposite)}
    function create_if_block_3$1(ctx) {
    	let div;

    	return {
    		c() {
    			div = element("div");
    			attr(div, "class", "sortable-handler");
    		},
    		m(target, anchor) {
    			insert(target, div, anchor);
    		},
    		d(detaching) {
    			if (detaching) detach(div);
    		}
    	};
    }

    // (1095:4) {#if (swipeout || accordionItem)}
    function create_if_block_2$2(ctx) {
    	let current;
    	const default_slot_template = /*$$slots*/ ctx[89].default;
    	const default_slot = create_slot(default_slot_template, ctx, /*$$scope*/ ctx[103], null);

    	return {
    		c() {
    			if (default_slot) default_slot.c();
    		},
    		m(target, anchor) {
    			if (default_slot) {
    				default_slot.m(target, anchor);
    			}

    			current = true;
    		},
    		p(ctx, dirty) {
    			if (default_slot) {
    				if (default_slot.p && dirty[3] & /*$$scope*/ 1024) {
    					default_slot.p(get_slot_context(default_slot_template, ctx, /*$$scope*/ ctx[103], null), get_slot_changes(default_slot_template, /*$$scope*/ ctx[103], dirty, null));
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
    			if (default_slot) default_slot.d(detaching);
    		}
    	};
    }

    // (363:16) {Utils.text(title)}
    function fallback_block(ctx) {
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
    			if (dirty[0] & /*title*/ 1 && t_value !== (t_value = Utils.text(/*title*/ ctx[0]) + "")) set_data(t, t_value);
    		},
    		d(detaching) {
    			if (detaching) detach(t);
    		}
    	};
    }

    function create_fragment$a(ctx) {
    	let current_block_type_index;
    	let if_block;
    	let if_block_anchor;
    	let current;
    	const if_block_creators = [create_if_block$2, create_if_block_1$2, create_else_block];
    	const if_blocks = [];

    	function select_block_type(ctx, dirty) {
    		if (/*divider*/ ctx[9] || /*groupTitle*/ ctx[10]) return 0;
    		if (/*isSimple*/ ctx[30]) return 1;
    		return 2;
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

    function instance$a($$self, $$props, $$invalidate) {
    	const omit_props_names = [
    		"class","title","text","media","subtitle","header","footer","tooltip","tooltipTrigger","link","tabLink","tabLinkActive","href","target","after","badge","badgeColor","mediaItem","mediaList","divider","groupTitle","swipeout","swipeoutOpened","sortable","sortableOpposite","accordionItem","accordionItemOpened","smartSelect","smartSelectParams","noChevron","chevronCenter","checkbox","radio","radioIcon","checked","indeterminate","name","value","readonly","required","disabled","virtualListIndex","smartSelectInstance"
    	];

    	let $$restProps = compute_rest_props($$props, omit_props_names);
    	const dispatch = createEventDispatcher();
    	let { class: className = undefined } = $$props;
    	let { title = undefined } = $$props;
    	let { text = undefined } = $$props;
    	let { media = undefined } = $$props;
    	let { subtitle = undefined } = $$props;
    	let { header = undefined } = $$props;
    	let { footer = undefined } = $$props;
    	let { tooltip = undefined } = $$props;
    	let { tooltipTrigger = undefined } = $$props;
    	let { link = undefined } = $$props;
    	let { tabLink = undefined } = $$props;
    	let { tabLinkActive = false } = $$props;
    	let { href = undefined } = $$props;
    	let { target = undefined } = $$props;
    	let { after = undefined } = $$props;
    	let { badge = undefined } = $$props;
    	let { badgeColor = undefined } = $$props;
    	let { mediaItem = false } = $$props;
    	let { mediaList = false } = $$props;
    	let { divider = false } = $$props;
    	let { groupTitle = false } = $$props;
    	let { swipeout = false } = $$props;
    	let { swipeoutOpened = false } = $$props;
    	let { sortable = undefined } = $$props;
    	let { sortableOpposite = undefined } = $$props;
    	let { accordionItem = false } = $$props;
    	let { accordionItemOpened = false } = $$props;
    	let { smartSelect = false } = $$props;
    	let { smartSelectParams = undefined } = $$props;
    	let { noChevron = undefined } = $$props;
    	let { chevronCenter = undefined } = $$props;
    	let { checkbox = undefined } = $$props;
    	let { radio = undefined } = $$props;
    	let { radioIcon = undefined } = $$props;
    	let { checked = undefined } = $$props;
    	let { indeterminate = undefined } = $$props;
    	let { name = undefined } = $$props;
    	let { value = undefined } = $$props;
    	let { readonly = undefined } = $$props;
    	let { required = undefined } = $$props;
    	let { disabled = undefined } = $$props;
    	let { virtualListIndex = undefined } = $$props;
    	let el;
    	let linkEl;
    	let innerEl;
    	let inputEl;
    	let f7SmartSelect;
    	let f7Tooltip;

    	function smartSelectInstance() {
    		return f7SmartSelect;
    	}

    	/* eslint-enable no-undef */
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

    	let initialWatchedOpened = false;

    	function watchSwipeoutOpened(opened) {
    		if (!initialWatchedOpened) {
    			initialWatchedOpened = true;
    			return;
    		}

    		if (!swipeout) return;

    		if (opened) {
    			f7.instance.swipeout.open(el);
    		} else {
    			f7.instance.swipeout.close(el);
    		}
    	}

    	function onClick(event) {
    		if (event.target.tagName.toLowerCase() !== "input") {
    			dispatch("click", event);
    			if (typeof $$props.onClick === "function") $$props.onClick(event);
    		}
    	}

    	function onSwipeoutOverswipeEnter(eventEl) {
    		if (eventEl !== el) return;
    		dispatch("swipeoutOverswipeEnter");
    		if (typeof $$props.onSwipeoutOverswipeEnter === "function") $$props.onSwipeoutOverswipeEnter();
    	}

    	function onSwipeoutOverswipeExit(eventEl) {
    		if (eventEl !== el) return;
    		dispatch("swipeoutOverswipeExit");
    		if (typeof $$props.onSwipeoutOverswipeExit === "function") $$props.onSwipeoutOverswipeExit();
    	}

    	function onSwipeoutDeleted(eventEl) {
    		if (eventEl !== el) return;
    		dispatch("swipeoutDeleted");
    		if (typeof $$props.onSwipeoutDeleted === "function") $$props.onSwipeoutDeleted();
    	}

    	function onSwipeoutDelete(eventEl) {
    		if (eventEl !== el) return;
    		dispatch("swipeoutDelete");
    		if (typeof $$props.onSwipeoutDelete === "function") $$props.onSwipeoutDelete();
    	}

    	function onSwipeoutClose(eventEl) {
    		if (eventEl !== el) return;
    		dispatch("swipeoutClose");
    		if (typeof $$props.onSwipeoutClose === "function") $$props.onSwipeoutClose();
    	}

    	function onSwipeoutClosed(eventEl) {
    		if (eventEl !== el) return;
    		dispatch("swipeoutClosed");
    		if (typeof $$props.onSwipeoutClosed === "function") $$props.onSwipeoutClosed();
    	}

    	function onSwipeoutOpen(eventEl) {
    		if (eventEl !== el) return;
    		dispatch("swipeoutOpen");
    		if (typeof $$props.onSwipeoutOpen === "function") $$props.onSwipeoutOpen();
    	}

    	function onSwipeoutOpened(eventEl) {
    		if (eventEl !== el) return;
    		dispatch("swipeoutOpened");
    		if (typeof $$props.onSwipeoutOpened === "function") $$props.onSwipeoutOpened();
    	}

    	function onSwipeout(eventEl, progress) {
    		if (eventEl !== el) return;
    		dispatch("swipeout", progress);
    	}

    	function onAccBeforeClose(eventEl, prevent) {
    		if (eventEl !== el) return;
    		dispatch("accordionBeforeClose", [prevent]);
    		if (typeof $$props.onAccordionBeforeClose === "function") $$props.onAccordionBeforeClose(prevent);
    	}

    	function onAccClose(eventEl) {
    		if (eventEl !== el) return;
    		dispatch("accordionClose");
    		if (typeof $$props.onAccordionClose === "function") $$props.onAccordionClose();
    	}

    	function onAccClosed(eventEl) {
    		if (eventEl !== el) return;
    		dispatch("accordionClosed");
    		if (typeof $$props.onAccordionClosed === "function") $$props.onAccordionClosed();
    	}

    	function onAccBeforeOpen(eventEl, prevent) {
    		if (eventEl !== el) return;
    		dispatch("accordionBeforeOpen", [prevent]);
    		if (typeof $$props.onAccordionBeforeOpen === "function") $$props.onAccordionBeforeOpen(prevent);
    	}

    	function onAccOpen(eventEl) {
    		if (eventEl !== el) return;
    		dispatch("accordionOpen");
    		if (typeof $$props.onAccordionOpen === "function") $$props.onAccordionOpen();
    	}

    	function onAccOpened(eventEl) {
    		if (eventEl !== el) return;
    		dispatch("accordionOpened");
    		if (typeof $$props.onAccordionOpened === "function") $$props.onAccordionOpened();
    	}

    	function onChange(event) {
    		dispatch("change", [event]);
    		if (typeof $$props.onChange === "function") $$props.onChange(event);
    	}

    	onMount(() => {
    		if (linkEl && $$props.routeProps) {
    			$$invalidate(24, linkEl.f7RouteProps = $$props.routeProps, linkEl);
    		}

    		if (indeterminate && inputEl) {
    			$$invalidate(26, inputEl.indeterminate = true, inputEl);
    		}

    		f7.ready(() => {
    			if (swipeout) {
    				f7.instance.on("swipeoutOpen", onSwipeoutOpen);
    				f7.instance.on("swipeoutOpened", onSwipeoutOpened);
    				f7.instance.on("swipeoutClose", onSwipeoutClose);
    				f7.instance.on("swipeoutClosed", onSwipeoutClosed);
    				f7.instance.on("swipeoutDelete", onSwipeoutDelete);
    				f7.instance.on("swipeoutDeleted", onSwipeoutDeleted);
    				f7.instance.on("swipeoutOverswipeEnter", onSwipeoutOverswipeEnter);
    				f7.instance.on("swipeoutOverswipeExit", onSwipeoutOverswipeExit);
    				f7.instance.on("swipeout", onSwipeout);
    			}

    			if (accordionItem) {
    				f7.instance.on("accordionBeforeOpen", onAccBeforeOpen);
    				f7.instance.on("accordionOpen", onAccOpen);
    				f7.instance.on("accordionOpened", onAccOpened);
    				f7.instance.on("accordionBeforeClose", onAccBeforeClose);
    				f7.instance.on("accordionClose", onAccClose);
    				f7.instance.on("accordionClosed", onAccClosed);
    			}

    			if (linkEl && smartSelect) {
    				const ssParams = Utils.extend({ el: linkEl }, smartSelectParams || {});
    				f7SmartSelect = f7.instance.smartSelect.create(ssParams);
    			}

    			if (swipeoutOpened) {
    				f7.instance.swipeout.open(el);
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
    		if (linkEl && $$props.routeProps) {
    			$$invalidate(24, linkEl.f7RouteProps = $$props.routeProps, linkEl);
    		}

    		if (inputEl) {
    			$$invalidate(26, inputEl.indeterminate = indeterminate, inputEl);
    		}
    	});

    	onDestroy(() => {
    		if (linkEl) {
    			delete linkEl.f7RouteProps;
    		}

    		if (!f7.instance) return;

    		if (swipeout) {
    			f7.instance.off("swipeoutOpen", onSwipeoutOpen);
    			f7.instance.off("swipeoutOpened", onSwipeoutOpened);
    			f7.instance.off("swipeoutClose", onSwipeoutClose);
    			f7.instance.off("swipeoutClosed", onSwipeoutClosed);
    			f7.instance.off("swipeoutDelete", onSwipeoutDelete);
    			f7.instance.off("swipeoutDeleted", onSwipeoutDeleted);
    			f7.instance.off("swipeoutOverswipeEnter", onSwipeoutOverswipeEnter);
    			f7.instance.off("swipeoutOverswipeExit", onSwipeoutOverswipeExit);
    			f7.instance.off("swipeout", onSwipeout);
    		}

    		if (accordionItem) {
    			f7.instance.off("accordionBeforeOpen", onAccBeforeOpen);
    			f7.instance.off("accordionOpen", onAccOpen);
    			f7.instance.off("accordionOpened", onAccOpened);
    			f7.instance.off("accordionBeforeClose", onAccBeforeClose);
    			f7.instance.off("accordionClose", onAccClose);
    			f7.instance.off("accordionClosed", onAccClosed);
    		}

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

    	function li_binding($$value) {
    		binding_callbacks[$$value ? "unshift" : "push"](() => {
    			$$invalidate(23, el = $$value);
    		});
    	}

    	function li_binding_1($$value) {
    		binding_callbacks[$$value ? "unshift" : "push"](() => {
    			$$invalidate(23, el = $$value);
    		});
    	}

    	function div0_binding($$value) {
    		binding_callbacks[$$value ? "unshift" : "push"](() => {
    			$$invalidate(25, innerEl = $$value);
    		});
    	}

    	function a_binding($$value) {
    		binding_callbacks[$$value ? "unshift" : "push"](() => {
    			$$invalidate(24, linkEl = $$value);
    		});
    	}

    	function input_binding($$value) {
    		binding_callbacks[$$value ? "unshift" : "push"](() => {
    			$$invalidate(26, inputEl = $$value);
    		});
    	}

    	function div_binding($$value) {
    		binding_callbacks[$$value ? "unshift" : "push"](() => {
    			$$invalidate(25, innerEl = $$value);
    		});
    	}

    	function div0_binding_1($$value) {
    		binding_callbacks[$$value ? "unshift" : "push"](() => {
    			$$invalidate(25, innerEl = $$value);
    		});
    	}

    	function div0_binding_2($$value) {
    		binding_callbacks[$$value ? "unshift" : "push"](() => {
    			$$invalidate(25, innerEl = $$value);
    		});
    	}

    	function a_binding_1($$value) {
    		binding_callbacks[$$value ? "unshift" : "push"](() => {
    			$$invalidate(24, linkEl = $$value);
    		});
    	}

    	function input_binding_1($$value) {
    		binding_callbacks[$$value ? "unshift" : "push"](() => {
    			$$invalidate(26, inputEl = $$value);
    		});
    	}

    	function div_binding_1($$value) {
    		binding_callbacks[$$value ? "unshift" : "push"](() => {
    			$$invalidate(25, innerEl = $$value);
    		});
    	}

    	function div0_binding_3($$value) {
    		binding_callbacks[$$value ? "unshift" : "push"](() => {
    			$$invalidate(25, innerEl = $$value);
    		});
    	}

    	function li_binding_2($$value) {
    		binding_callbacks[$$value ? "unshift" : "push"](() => {
    			$$invalidate(23, el = $$value);
    		});
    	}

    	$$self.$set = $$new_props => {
    		$$invalidate(88, $$props = assign(assign({}, $$props), exclude_internal_props($$new_props)));
    		$$invalidate(45, $$restProps = compute_rest_props($$props, omit_props_names));
    		if ("class" in $$new_props) $$invalidate(46, className = $$new_props.class);
    		if ("title" in $$new_props) $$invalidate(0, title = $$new_props.title);
    		if ("text" in $$new_props) $$invalidate(1, text = $$new_props.text);
    		if ("media" in $$new_props) $$invalidate(2, media = $$new_props.media);
    		if ("subtitle" in $$new_props) $$invalidate(3, subtitle = $$new_props.subtitle);
    		if ("header" in $$new_props) $$invalidate(4, header = $$new_props.header);
    		if ("footer" in $$new_props) $$invalidate(5, footer = $$new_props.footer);
    		if ("tooltip" in $$new_props) $$invalidate(47, tooltip = $$new_props.tooltip);
    		if ("tooltipTrigger" in $$new_props) $$invalidate(48, tooltipTrigger = $$new_props.tooltipTrigger);
    		if ("link" in $$new_props) $$invalidate(49, link = $$new_props.link);
    		if ("tabLink" in $$new_props) $$invalidate(50, tabLink = $$new_props.tabLink);
    		if ("tabLinkActive" in $$new_props) $$invalidate(51, tabLinkActive = $$new_props.tabLinkActive);
    		if ("href" in $$new_props) $$invalidate(52, href = $$new_props.href);
    		if ("target" in $$new_props) $$invalidate(53, target = $$new_props.target);
    		if ("after" in $$new_props) $$invalidate(6, after = $$new_props.after);
    		if ("badge" in $$new_props) $$invalidate(7, badge = $$new_props.badge);
    		if ("badgeColor" in $$new_props) $$invalidate(8, badgeColor = $$new_props.badgeColor);
    		if ("mediaItem" in $$new_props) $$invalidate(54, mediaItem = $$new_props.mediaItem);
    		if ("mediaList" in $$new_props) $$invalidate(55, mediaList = $$new_props.mediaList);
    		if ("divider" in $$new_props) $$invalidate(9, divider = $$new_props.divider);
    		if ("groupTitle" in $$new_props) $$invalidate(10, groupTitle = $$new_props.groupTitle);
    		if ("swipeout" in $$new_props) $$invalidate(11, swipeout = $$new_props.swipeout);
    		if ("swipeoutOpened" in $$new_props) $$invalidate(56, swipeoutOpened = $$new_props.swipeoutOpened);
    		if ("sortable" in $$new_props) $$invalidate(12, sortable = $$new_props.sortable);
    		if ("sortableOpposite" in $$new_props) $$invalidate(57, sortableOpposite = $$new_props.sortableOpposite);
    		if ("accordionItem" in $$new_props) $$invalidate(13, accordionItem = $$new_props.accordionItem);
    		if ("accordionItemOpened" in $$new_props) $$invalidate(58, accordionItemOpened = $$new_props.accordionItemOpened);
    		if ("smartSelect" in $$new_props) $$invalidate(59, smartSelect = $$new_props.smartSelect);
    		if ("smartSelectParams" in $$new_props) $$invalidate(60, smartSelectParams = $$new_props.smartSelectParams);
    		if ("noChevron" in $$new_props) $$invalidate(61, noChevron = $$new_props.noChevron);
    		if ("chevronCenter" in $$new_props) $$invalidate(62, chevronCenter = $$new_props.chevronCenter);
    		if ("checkbox" in $$new_props) $$invalidate(14, checkbox = $$new_props.checkbox);
    		if ("radio" in $$new_props) $$invalidate(15, radio = $$new_props.radio);
    		if ("radioIcon" in $$new_props) $$invalidate(63, radioIcon = $$new_props.radioIcon);
    		if ("checked" in $$new_props) $$invalidate(16, checked = $$new_props.checked);
    		if ("indeterminate" in $$new_props) $$invalidate(64, indeterminate = $$new_props.indeterminate);
    		if ("name" in $$new_props) $$invalidate(17, name = $$new_props.name);
    		if ("value" in $$new_props) $$invalidate(18, value = $$new_props.value);
    		if ("readonly" in $$new_props) $$invalidate(19, readonly = $$new_props.readonly);
    		if ("required" in $$new_props) $$invalidate(20, required = $$new_props.required);
    		if ("disabled" in $$new_props) $$invalidate(21, disabled = $$new_props.disabled);
    		if ("virtualListIndex" in $$new_props) $$invalidate(22, virtualListIndex = $$new_props.virtualListIndex);
    		if ("$$scope" in $$new_props) $$invalidate(103, $$scope = $$new_props.$$scope);
    	};

    	let isMedia;
    	let isSortable;
    	let isSortableOpposite;
    	let isSimple;
    	let liClasses;
    	let contentClasses;
    	let linkClasses;
    	let linkAttrs;
    	let isLink;
    	let hasMedia;
    	let hasTitle;
    	let hasHeader;
    	let hasFooter;
    	let hasSubtitle;
    	let hasText;
    	let hasAfter;

    	$$self.$$.update = () => {
    		if ($$self.$$.dirty[1] & /*mediaList, mediaItem*/ 25165824) {
    			 $$invalidate(27, isMedia = mediaList || mediaItem || getContext("f7ListMedia"));
    		}

    		if ($$self.$$.dirty[0] & /*sortable*/ 4096) {
    			 $$invalidate(28, isSortable = sortable || getContext("f7ListSortable"));
    		}

    		if ($$self.$$.dirty[1] & /*sortableOpposite*/ 67108864) {
    			 $$invalidate(29, isSortableOpposite = sortableOpposite || getContext("f7ListSortableOpposite"));
    		}

    		 $$invalidate(31, liClasses = Utils.classNames(
    			className,
    			{
    				"item-divider": divider,
    				"list-group-title": groupTitle,
    				"media-item": isMedia,
    				swipeout,
    				"accordion-item": accordionItem,
    				"accordion-item-opened": accordionItemOpened,
    				disabled: disabled && !(radio || checkbox),
    				"no-chevron": noChevron,
    				"chevron-center": chevronCenter,
    				"disallow-sorting": sortable === false
    			},
    			Mixins.colorClasses($$props)
    		));

    		 $$invalidate(32, contentClasses = Utils.classNames(
    			className,
    			"item-content",
    			{
    				"item-checkbox": checkbox,
    				"item-radio": radio,
    				"item-radio-icon-start": radio && radioIcon === "start",
    				"item-radio-icon-end": radio && radioIcon === "end"
    			},
    			Mixins.colorClasses($$props)
    		));

    		 $$invalidate(33, linkClasses = Utils.classNames(
    			{
    				"item-link": true,
    				"smart-select": smartSelect,
    				"tab-link": tabLink || tabLink === "",
    				"tab-link-active": tabLinkActive
    			},
    			Mixins.linkRouterClasses($$props),
    			Mixins.linkActionsClasses($$props)
    		));

    		 $$invalidate(34, linkAttrs = {
    			href: link === true ? "" : link || href,
    			target,
    			"data-tab": Utils.isStringProp(tabLink) && tabLink || undefined,
    			...Mixins.linkRouterAttrs($$props),
    			...Mixins.linkActionsAttrs($$props)
    		});

    		if ($$self.$$.dirty[0] & /*accordionItem*/ 8192 | $$self.$$.dirty[1] & /*link, href, smartSelect*/ 270794752) {
    			 $$invalidate(35, isLink = link || href || smartSelect || accordionItem);
    		}

    		if ($$self.$$.dirty[0] & /*media*/ 4) {
    			/* eslint-disable no-undef */
    			 $$invalidate(36, hasMedia = typeof media !== "undefined" || hasSlots(arguments, "media"));
    		}

    		if ($$self.$$.dirty[0] & /*title*/ 1) {
    			 $$invalidate(37, hasTitle = typeof title !== "undefined" || hasSlots(arguments, "title"));
    		}

    		if ($$self.$$.dirty[0] & /*header*/ 16) {
    			 $$invalidate(38, hasHeader = typeof header !== "undefined" || hasSlots(arguments, "header"));
    		}

    		if ($$self.$$.dirty[0] & /*footer*/ 32) {
    			 $$invalidate(39, hasFooter = typeof footer !== "undefined" || hasSlots(arguments, "footer"));
    		}

    		if ($$self.$$.dirty[0] & /*subtitle*/ 8) {
    			 $$invalidate(40, hasSubtitle = typeof subtitle !== "undefined" || hasSlots(arguments, "subtitle"));
    		}

    		if ($$self.$$.dirty[0] & /*text*/ 2) {
    			 $$invalidate(41, hasText = typeof text !== "undefined" || hasSlots(arguments, "text"));
    		}

    		if ($$self.$$.dirty[0] & /*after, badge*/ 192) {
    			 $$invalidate(42, hasAfter = typeof after !== "undefined" || typeof badge !== "undefined" || hasSlots(arguments, "after"));
    		}

    		if ($$self.$$.dirty[1] & /*tooltip*/ 65536) {
    			 watchTooltip(tooltip);
    		}

    		if ($$self.$$.dirty[1] & /*swipeoutOpened*/ 33554432) {
    			 watchSwipeoutOpened(swipeoutOpened);
    		}
    	};

    	 $$invalidate(30, isSimple = getContext("f7ListSimple"));
    	$$props = exclude_internal_props($$props);

    	return [
    		title,
    		text,
    		media,
    		subtitle,
    		header,
    		footer,
    		after,
    		badge,
    		badgeColor,
    		divider,
    		groupTitle,
    		swipeout,
    		sortable,
    		accordionItem,
    		checkbox,
    		radio,
    		checked,
    		name,
    		value,
    		readonly,
    		required,
    		disabled,
    		virtualListIndex,
    		el,
    		linkEl,
    		innerEl,
    		inputEl,
    		isMedia,
    		isSortable,
    		isSortableOpposite,
    		isSimple,
    		liClasses,
    		contentClasses,
    		linkClasses,
    		linkAttrs,
    		isLink,
    		hasMedia,
    		hasTitle,
    		hasHeader,
    		hasFooter,
    		hasSubtitle,
    		hasText,
    		hasAfter,
    		onClick,
    		onChange,
    		$$restProps,
    		className,
    		tooltip,
    		tooltipTrigger,
    		link,
    		tabLink,
    		tabLinkActive,
    		href,
    		target,
    		mediaItem,
    		mediaList,
    		swipeoutOpened,
    		sortableOpposite,
    		accordionItemOpened,
    		smartSelect,
    		smartSelectParams,
    		noChevron,
    		chevronCenter,
    		radioIcon,
    		indeterminate,
    		smartSelectInstance,
    		f7SmartSelect,
    		f7Tooltip,
    		tooltipText,
    		initialWatchedOpened,
    		dispatch,
    		watchTooltip,
    		watchSwipeoutOpened,
    		onSwipeoutOverswipeEnter,
    		onSwipeoutOverswipeExit,
    		onSwipeoutDeleted,
    		onSwipeoutDelete,
    		onSwipeoutClose,
    		onSwipeoutClosed,
    		onSwipeoutOpen,
    		onSwipeoutOpened,
    		onSwipeout,
    		onAccBeforeClose,
    		onAccClose,
    		onAccClosed,
    		onAccBeforeOpen,
    		onAccOpen,
    		onAccOpened,
    		$$props,
    		$$slots,
    		li_binding,
    		li_binding_1,
    		div0_binding,
    		a_binding,
    		input_binding,
    		div_binding,
    		div0_binding_1,
    		div0_binding_2,
    		a_binding_1,
    		input_binding_1,
    		div_binding_1,
    		div0_binding_3,
    		li_binding_2,
    		$$scope
    	];
    }

    class List_item extends SvelteComponent {
    	constructor(options) {
    		super();

    		init(
    			this,
    			options,
    			instance$a,
    			create_fragment$a,
    			safe_not_equal,
    			{
    				class: 46,
    				title: 0,
    				text: 1,
    				media: 2,
    				subtitle: 3,
    				header: 4,
    				footer: 5,
    				tooltip: 47,
    				tooltipTrigger: 48,
    				link: 49,
    				tabLink: 50,
    				tabLinkActive: 51,
    				href: 52,
    				target: 53,
    				after: 6,
    				badge: 7,
    				badgeColor: 8,
    				mediaItem: 54,
    				mediaList: 55,
    				divider: 9,
    				groupTitle: 10,
    				swipeout: 11,
    				swipeoutOpened: 56,
    				sortable: 12,
    				sortableOpposite: 57,
    				accordionItem: 13,
    				accordionItemOpened: 58,
    				smartSelect: 59,
    				smartSelectParams: 60,
    				noChevron: 61,
    				chevronCenter: 62,
    				checkbox: 14,
    				radio: 15,
    				radioIcon: 63,
    				checked: 16,
    				indeterminate: 64,
    				name: 17,
    				value: 18,
    				readonly: 19,
    				required: 20,
    				disabled: 21,
    				virtualListIndex: 22,
    				smartSelectInstance: 65
    			},
    			[-1, -1, -1, -1]
    		);
    	}

    	get smartSelectInstance() {
    		return this.$$.ctx[65];
    	}
    }

    /* public/packages/svelte/components/list.svelte generated by Svelte v3.22.3 */
    const get_after_list_slot_changes_1 = dirty => ({});
    const get_after_list_slot_context_1 = ctx => ({});
    const get_list_slot_changes_1 = dirty => ({});
    const get_list_slot_context_1 = ctx => ({});
    const get_before_list_slot_changes_1 = dirty => ({});
    const get_before_list_slot_context_1 = ctx => ({});
    const get_after_list_slot_changes = dirty => ({});
    const get_after_list_slot_context = ctx => ({});
    const get_list_slot_changes = dirty => ({});
    const get_list_slot_context = ctx => ({});
    const get_before_list_slot_changes = dirty => ({});
    const get_before_list_slot_context = ctx => ({});

    // (219:0) {:else}
    function create_else_block_1$1(ctx) {
    	let div;
    	let t0;
    	let current_block_type_index;
    	let if_block;
    	let t1;
    	let current;
    	const before_list_slot_template = /*$$slots*/ ctx[51]["before-list"];
    	const before_list_slot = create_slot(before_list_slot_template, ctx, /*$$scope*/ ctx[50], get_before_list_slot_context_1);
    	const if_block_creators = [create_if_block_2$3, create_else_block_2$1];
    	const if_blocks = [];

    	function select_block_type_2(ctx, dirty) {
    		if (/*hasUlSlots*/ ctx[4] && /*ul*/ ctx[0]) return 0;
    		return 1;
    	}

    	current_block_type_index = select_block_type_2(ctx);
    	if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);
    	const after_list_slot_template = /*$$slots*/ ctx[51]["after-list"];
    	const after_list_slot = create_slot(after_list_slot_template, ctx, /*$$scope*/ ctx[50], get_after_list_slot_context_1);

    	let div_levels = [
    		{ class: /*classes*/ ctx[5] },
    		{
    			"data-sortable-move-elements": typeof /*sortableMoveElements*/ ctx[1] !== "undefined"
    			? /*sortableMoveElements*/ ctx[1].toString()
    			: undefined
    		},
    		restProps(/*$$restProps*/ ctx[7])
    	];

    	let div_data = {};

    	for (let i = 0; i < div_levels.length; i += 1) {
    		div_data = assign(div_data, div_levels[i]);
    	}

    	return {
    		c() {
    			div = element("div");
    			if (before_list_slot) before_list_slot.c();
    			t0 = space();
    			if_block.c();
    			t1 = space();
    			if (after_list_slot) after_list_slot.c();
    			set_attributes(div, div_data);
    		},
    		m(target, anchor) {
    			insert(target, div, anchor);

    			if (before_list_slot) {
    				before_list_slot.m(div, null);
    			}

    			append(div, t0);
    			if_blocks[current_block_type_index].m(div, null);
    			append(div, t1);

    			if (after_list_slot) {
    				after_list_slot.m(div, null);
    			}

    			/*div_binding*/ ctx[53](div);
    			current = true;
    		},
    		p(ctx, dirty) {
    			if (before_list_slot) {
    				if (before_list_slot.p && dirty[1] & /*$$scope*/ 524288) {
    					before_list_slot.p(get_slot_context(before_list_slot_template, ctx, /*$$scope*/ ctx[50], get_before_list_slot_context_1), get_slot_changes(before_list_slot_template, /*$$scope*/ ctx[50], dirty, get_before_list_slot_changes_1));
    				}
    			}

    			let previous_block_index = current_block_type_index;
    			current_block_type_index = select_block_type_2(ctx);

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
    				if_block.m(div, t1);
    			}

    			if (after_list_slot) {
    				if (after_list_slot.p && dirty[1] & /*$$scope*/ 524288) {
    					after_list_slot.p(get_slot_context(after_list_slot_template, ctx, /*$$scope*/ ctx[50], get_after_list_slot_context_1), get_slot_changes(after_list_slot_template, /*$$scope*/ ctx[50], dirty, get_after_list_slot_changes_1));
    				}
    			}

    			set_attributes(div, get_spread_update(div_levels, [
    				dirty[0] & /*classes*/ 32 && { class: /*classes*/ ctx[5] },
    				dirty[0] & /*sortableMoveElements*/ 2 && {
    					"data-sortable-move-elements": typeof /*sortableMoveElements*/ ctx[1] !== "undefined"
    					? /*sortableMoveElements*/ ctx[1].toString()
    					: undefined
    				},
    				dirty[0] & /*$$restProps*/ 128 && restProps(/*$$restProps*/ ctx[7])
    			]));
    		},
    		i(local) {
    			if (current) return;
    			transition_in(before_list_slot, local);
    			transition_in(if_block);
    			transition_in(after_list_slot, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(before_list_slot, local);
    			transition_out(if_block);
    			transition_out(after_list_slot, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(div);
    			if (before_list_slot) before_list_slot.d(detaching);
    			if_blocks[current_block_type_index].d();
    			if (after_list_slot) after_list_slot.d(detaching);
    			/*div_binding*/ ctx[53](null);
    		}
    	};
    }

    // (200:0) {#if form}
    function create_if_block$3(ctx) {
    	let form_1;
    	let t0;
    	let current_block_type_index;
    	let if_block;
    	let t1;
    	let current;
    	let dispose;
    	const before_list_slot_template = /*$$slots*/ ctx[51]["before-list"];
    	const before_list_slot = create_slot(before_list_slot_template, ctx, /*$$scope*/ ctx[50], get_before_list_slot_context);
    	const if_block_creators = [create_if_block_1$3, create_else_block$1];
    	const if_blocks = [];

    	function select_block_type_1(ctx, dirty) {
    		if (/*hasUlSlots*/ ctx[4] && /*ul*/ ctx[0]) return 0;
    		return 1;
    	}

    	current_block_type_index = select_block_type_1(ctx);
    	if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);
    	const after_list_slot_template = /*$$slots*/ ctx[51]["after-list"];
    	const after_list_slot = create_slot(after_list_slot_template, ctx, /*$$scope*/ ctx[50], get_after_list_slot_context);

    	let form_1_levels = [
    		{ class: /*classes*/ ctx[5] },
    		{
    			"data-sortable-move-elements": typeof /*sortableMoveElements*/ ctx[1] !== "undefined"
    			? /*sortableMoveElements*/ ctx[1].toString()
    			: undefined
    		},
    		restProps(/*$$restProps*/ ctx[7])
    	];

    	let form_1_data = {};

    	for (let i = 0; i < form_1_levels.length; i += 1) {
    		form_1_data = assign(form_1_data, form_1_levels[i]);
    	}

    	return {
    		c() {
    			form_1 = element("form");
    			if (before_list_slot) before_list_slot.c();
    			t0 = space();
    			if_block.c();
    			t1 = space();
    			if (after_list_slot) after_list_slot.c();
    			set_attributes(form_1, form_1_data);
    		},
    		m(target, anchor, remount) {
    			insert(target, form_1, anchor);

    			if (before_list_slot) {
    				before_list_slot.m(form_1, null);
    			}

    			append(form_1, t0);
    			if_blocks[current_block_type_index].m(form_1, null);
    			append(form_1, t1);

    			if (after_list_slot) {
    				after_list_slot.m(form_1, null);
    			}

    			/*form_1_binding*/ ctx[52](form_1);
    			current = true;
    			if (remount) dispose();
    			dispose = listen(form_1, "submit", /*onSubmit*/ ctx[6]);
    		},
    		p(ctx, dirty) {
    			if (before_list_slot) {
    				if (before_list_slot.p && dirty[1] & /*$$scope*/ 524288) {
    					before_list_slot.p(get_slot_context(before_list_slot_template, ctx, /*$$scope*/ ctx[50], get_before_list_slot_context), get_slot_changes(before_list_slot_template, /*$$scope*/ ctx[50], dirty, get_before_list_slot_changes));
    				}
    			}

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
    				if_block = if_blocks[current_block_type_index];

    				if (!if_block) {
    					if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);
    					if_block.c();
    				}

    				transition_in(if_block, 1);
    				if_block.m(form_1, t1);
    			}

    			if (after_list_slot) {
    				if (after_list_slot.p && dirty[1] & /*$$scope*/ 524288) {
    					after_list_slot.p(get_slot_context(after_list_slot_template, ctx, /*$$scope*/ ctx[50], get_after_list_slot_context), get_slot_changes(after_list_slot_template, /*$$scope*/ ctx[50], dirty, get_after_list_slot_changes));
    				}
    			}

    			set_attributes(form_1, get_spread_update(form_1_levels, [
    				dirty[0] & /*classes*/ 32 && { class: /*classes*/ ctx[5] },
    				dirty[0] & /*sortableMoveElements*/ 2 && {
    					"data-sortable-move-elements": typeof /*sortableMoveElements*/ ctx[1] !== "undefined"
    					? /*sortableMoveElements*/ ctx[1].toString()
    					: undefined
    				},
    				dirty[0] & /*$$restProps*/ 128 && restProps(/*$$restProps*/ ctx[7])
    			]));
    		},
    		i(local) {
    			if (current) return;
    			transition_in(before_list_slot, local);
    			transition_in(if_block);
    			transition_in(after_list_slot, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(before_list_slot, local);
    			transition_out(if_block);
    			transition_out(after_list_slot, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(form_1);
    			if (before_list_slot) before_list_slot.d(detaching);
    			if_blocks[current_block_type_index].d();
    			if (after_list_slot) after_list_slot.d(detaching);
    			/*form_1_binding*/ ctx[52](null);
    			dispose();
    		}
    	};
    }

    // (232:4) {:else}
    function create_else_block_2$1(ctx) {
    	let current;
    	const default_slot_template = /*$$slots*/ ctx[51].default;
    	const default_slot = create_slot(default_slot_template, ctx, /*$$scope*/ ctx[50], null);

    	return {
    		c() {
    			if (default_slot) default_slot.c();
    		},
    		m(target, anchor) {
    			if (default_slot) {
    				default_slot.m(target, anchor);
    			}

    			current = true;
    		},
    		p(ctx, dirty) {
    			if (default_slot) {
    				if (default_slot.p && dirty[1] & /*$$scope*/ 524288) {
    					default_slot.p(get_slot_context(default_slot_template, ctx, /*$$scope*/ ctx[50], null), get_slot_changes(default_slot_template, /*$$scope*/ ctx[50], dirty, null));
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
    			if (default_slot) default_slot.d(detaching);
    		}
    	};
    }

    // (227:4) {#if hasUlSlots && ul}
    function create_if_block_2$3(ctx) {
    	let ul_1;
    	let t;
    	let current;
    	const list_slot_template = /*$$slots*/ ctx[51].list;
    	const list_slot = create_slot(list_slot_template, ctx, /*$$scope*/ ctx[50], get_list_slot_context_1);
    	const default_slot_template = /*$$slots*/ ctx[51].default;
    	const default_slot = create_slot(default_slot_template, ctx, /*$$scope*/ ctx[50], null);

    	return {
    		c() {
    			ul_1 = element("ul");
    			if (list_slot) list_slot.c();
    			t = space();
    			if (default_slot) default_slot.c();
    		},
    		m(target, anchor) {
    			insert(target, ul_1, anchor);

    			if (list_slot) {
    				list_slot.m(ul_1, null);
    			}

    			append(ul_1, t);

    			if (default_slot) {
    				default_slot.m(ul_1, null);
    			}

    			current = true;
    		},
    		p(ctx, dirty) {
    			if (list_slot) {
    				if (list_slot.p && dirty[1] & /*$$scope*/ 524288) {
    					list_slot.p(get_slot_context(list_slot_template, ctx, /*$$scope*/ ctx[50], get_list_slot_context_1), get_slot_changes(list_slot_template, /*$$scope*/ ctx[50], dirty, get_list_slot_changes_1));
    				}
    			}

    			if (default_slot) {
    				if (default_slot.p && dirty[1] & /*$$scope*/ 524288) {
    					default_slot.p(get_slot_context(default_slot_template, ctx, /*$$scope*/ ctx[50], null), get_slot_changes(default_slot_template, /*$$scope*/ ctx[50], dirty, null));
    				}
    			}
    		},
    		i(local) {
    			if (current) return;
    			transition_in(list_slot, local);
    			transition_in(default_slot, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(list_slot, local);
    			transition_out(default_slot, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(ul_1);
    			if (list_slot) list_slot.d(detaching);
    			if (default_slot) default_slot.d(detaching);
    		}
    	};
    }

    // (214:4) {:else}
    function create_else_block$1(ctx) {
    	let current;
    	const default_slot_template = /*$$slots*/ ctx[51].default;
    	const default_slot = create_slot(default_slot_template, ctx, /*$$scope*/ ctx[50], null);

    	return {
    		c() {
    			if (default_slot) default_slot.c();
    		},
    		m(target, anchor) {
    			if (default_slot) {
    				default_slot.m(target, anchor);
    			}

    			current = true;
    		},
    		p(ctx, dirty) {
    			if (default_slot) {
    				if (default_slot.p && dirty[1] & /*$$scope*/ 524288) {
    					default_slot.p(get_slot_context(default_slot_template, ctx, /*$$scope*/ ctx[50], null), get_slot_changes(default_slot_template, /*$$scope*/ ctx[50], dirty, null));
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
    			if (default_slot) default_slot.d(detaching);
    		}
    	};
    }

    // (209:4) {#if hasUlSlots && ul}
    function create_if_block_1$3(ctx) {
    	let ul_1;
    	let t;
    	let current;
    	const list_slot_template = /*$$slots*/ ctx[51].list;
    	const list_slot = create_slot(list_slot_template, ctx, /*$$scope*/ ctx[50], get_list_slot_context);
    	const default_slot_template = /*$$slots*/ ctx[51].default;
    	const default_slot = create_slot(default_slot_template, ctx, /*$$scope*/ ctx[50], null);

    	return {
    		c() {
    			ul_1 = element("ul");
    			if (list_slot) list_slot.c();
    			t = space();
    			if (default_slot) default_slot.c();
    		},
    		m(target, anchor) {
    			insert(target, ul_1, anchor);

    			if (list_slot) {
    				list_slot.m(ul_1, null);
    			}

    			append(ul_1, t);

    			if (default_slot) {
    				default_slot.m(ul_1, null);
    			}

    			current = true;
    		},
    		p(ctx, dirty) {
    			if (list_slot) {
    				if (list_slot.p && dirty[1] & /*$$scope*/ 524288) {
    					list_slot.p(get_slot_context(list_slot_template, ctx, /*$$scope*/ ctx[50], get_list_slot_context), get_slot_changes(list_slot_template, /*$$scope*/ ctx[50], dirty, get_list_slot_changes));
    				}
    			}

    			if (default_slot) {
    				if (default_slot.p && dirty[1] & /*$$scope*/ 524288) {
    					default_slot.p(get_slot_context(default_slot_template, ctx, /*$$scope*/ ctx[50], null), get_slot_changes(default_slot_template, /*$$scope*/ ctx[50], dirty, null));
    				}
    			}
    		},
    		i(local) {
    			if (current) return;
    			transition_in(list_slot, local);
    			transition_in(default_slot, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(list_slot, local);
    			transition_out(default_slot, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(ul_1);
    			if (list_slot) list_slot.d(detaching);
    			if (default_slot) default_slot.d(detaching);
    		}
    	};
    }

    function create_fragment$b(ctx) {
    	let current_block_type_index;
    	let if_block;
    	let if_block_anchor;
    	let current;
    	const if_block_creators = [create_if_block$3, create_else_block_1$1];
    	const if_blocks = [];

    	function select_block_type(ctx, dirty) {
    		if (/*form*/ ctx[2]) return 0;
    		return 1;
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

    function instance$b($$self, $$props, $$invalidate) {
    	const omit_props_names = [
    		"class","ul","inset","xsmallInset","smallInset","mediumInset","largeInset","xlargeInset","mediaList","sortable","sortableTapHold","sortableEnabled","sortableMoveElements","sortableOpposite","accordionList","accordionOpposite","contactsList","simpleList","linksList","noHairlines","noHairlinesBetween","noHairlinesMd","noHairlinesBetweenMd","noHairlinesIos","noHairlinesBetweenIos","noHairlinesAurora","noHairlinesBetweenAurora","noChevron","chevronCenter","tab","tabActive","form","formStoreData","inlineLabels","virtualList","virtualListParams","virtualListInstance"
    	];

    	let $$restProps = compute_rest_props($$props, omit_props_names);
    	const dispatch = createEventDispatcher();
    	let { class: className = undefined } = $$props;
    	let { ul = true } = $$props;
    	let { inset = false } = $$props;
    	let { xsmallInset = false } = $$props;
    	let { smallInset = false } = $$props;
    	let { mediumInset = false } = $$props;
    	let { largeInset = false } = $$props;
    	let { xlargeInset = false } = $$props;
    	let { mediaList = false } = $$props;
    	let { sortable = false } = $$props;
    	let { sortableTapHold = false } = $$props;
    	let { sortableEnabled = false } = $$props;
    	let { sortableMoveElements = undefined } = $$props;
    	let { sortableOpposite = false } = $$props;
    	let { accordionList = false } = $$props;
    	let { accordionOpposite = false } = $$props;
    	let { contactsList = false } = $$props;
    	let { simpleList = false } = $$props;
    	let { linksList = false } = $$props;
    	let { noHairlines = false } = $$props;
    	let { noHairlinesBetween = false } = $$props;
    	let { noHairlinesMd = false } = $$props;
    	let { noHairlinesBetweenMd = false } = $$props;
    	let { noHairlinesIos = false } = $$props;
    	let { noHairlinesBetweenIos = false } = $$props;
    	let { noHairlinesAurora = false } = $$props;
    	let { noHairlinesBetweenAurora = false } = $$props;
    	let { noChevron = false } = $$props;
    	let { chevronCenter = false } = $$props;
    	let { tab = false } = $$props;
    	let { tabActive = false } = $$props;
    	let { form = false } = $$props;
    	let { formStoreData = false } = $$props;
    	let { inlineLabels = false } = $$props;
    	let { virtualList = false } = $$props;
    	let { virtualListParams = undefined } = $$props;
    	let el;
    	let f7VirtualList;

    	function virtualListInstance() {
    		return f7VirtualList;
    	}

    	setContext("f7ListMedia", mediaList);
    	setContext("f7ListSortable", sortable);
    	setContext("f7ListSortableOpposite", sortableOpposite);
    	setContext("f7ListSimple", simpleList);

    	function onSubmit(event) {
    		dispatch("submit", [event]);
    		if (typeof $$props.onSubmit === "function") $$props.onSubmit(event);
    	}

    	function onSortableEnable(sortableEl) {
    		if (sortableEl !== el) return;
    		dispatch("sortableEnable");
    		if (typeof $$props.onSortableEnable === "function") $$props.onSortableEnable();
    	}

    	function onSortableDisable(sortableEl) {
    		if (sortableEl !== el) return;
    		dispatch("sortableDisable");
    		if (typeof $$props.onSortableDisable === "function") $$props.onSortableDisable();
    	}

    	function onSortableSort(listItemEl, sortData, listEl) {
    		if (listEl !== el) return;
    		dispatch("sortableSort", [sortData]);
    		if (typeof $$props.onSortableSort === "function") $$props.onSortableSort(sortData);
    	}

    	function onTabShow(tabEl) {
    		if (tabEl !== el) return;
    		dispatch("tabShow");
    		if (typeof $$props.onTabShow === "function") $$props.onTabShow(tabEl);
    	}

    	function onTabHide(tabEl) {
    		if (tabEl !== el) return;
    		dispatch("tabHide");
    		if (typeof $$props.onTabHide === "function") $$props.onTabHide(tabEl);
    	}

    	onMount(() => {
    		f7.ready(() => {
    			f7.instance.on("sortableEnable", onSortableEnable);
    			f7.instance.on("sortableDisable", onSortableDisable);
    			f7.instance.on("sortableSort", onSortableSort);
    			f7.instance.on("tabShow", onTabShow);
    			f7.instance.on("tabHide", onTabHide);
    			if (!virtualList) return;
    			const vlParams = virtualListParams || {};
    			if (!vlParams.renderItem && !vlParams.itemTemplate && !vlParams.renderExternal) return;

    			f7VirtualList = f7.instance.virtualList.create(Utils.extend(
    				{
    					el,
    					on: {
    						itemBeforeInsert(itemEl, item) {
    							const vl = this;
    							dispatch("virtualItemBeforeInsert", [vl, itemEl, item]);
    							if (typeof $$props.onVirtualItemBeforeInsert === "function") $$props.onVirtualItemBeforeInsert(vl, itemEl, item);
    						},
    						beforeClear(fragment) {
    							const vl = this;
    							dispatch("virtualBeforeClear", [vl, fragment]);
    							if (typeof $$props.onVirtualBeforeClear === "function") $$props.onVirtualBeforeClear(vl, fragment);
    						},
    						itemsBeforeInsert(fragment) {
    							const vl = this;
    							dispatch("virtualItemsBeforeInsert", [vl, fragment]);
    							if (typeof $$props.onVirtualItemsBeforeInsert === "function") $$props.onVirtualItemsBeforeInsert(vl, fragment);
    						},
    						itemsAfterInsert(fragment) {
    							const vl = this;
    							dispatch("virtualItemsAfterInsert", [vl, fragment]);
    							if (typeof $$props.onVirtualItemsAfterInsert === "function") $$props.onVirtualItemsAfterInsert(vl, fragment);
    						}
    					}
    				},
    				vlParams
    			));
    		});
    	});

    	onDestroy(() => {
    		if (!f7.instance) return;
    		f7.instance.off("sortableEnable", onSortableEnable);
    		f7.instance.off("sortableDisable", onSortableDisable);
    		f7.instance.off("sortableSort", onSortableSort);
    		f7.instance.off("tabShow", onTabShow);
    		f7.instance.off("tabHide", onTabHide);
    		if (f7VirtualList && f7VirtualList.destroy) f7VirtualList.destroy();
    	});

    	let { $$slots = {}, $$scope } = $$props;

    	function form_1_binding($$value) {
    		binding_callbacks[$$value ? "unshift" : "push"](() => {
    			$$invalidate(3, el = $$value);
    		});
    	}

    	function div_binding($$value) {
    		binding_callbacks[$$value ? "unshift" : "push"](() => {
    			$$invalidate(3, el = $$value);
    		});
    	}

    	$$self.$set = $$new_props => {
    		$$invalidate(49, $$props = assign(assign({}, $$props), exclude_internal_props($$new_props)));
    		$$invalidate(7, $$restProps = compute_rest_props($$props, omit_props_names));
    		if ("class" in $$new_props) $$invalidate(8, className = $$new_props.class);
    		if ("ul" in $$new_props) $$invalidate(0, ul = $$new_props.ul);
    		if ("inset" in $$new_props) $$invalidate(9, inset = $$new_props.inset);
    		if ("xsmallInset" in $$new_props) $$invalidate(10, xsmallInset = $$new_props.xsmallInset);
    		if ("smallInset" in $$new_props) $$invalidate(11, smallInset = $$new_props.smallInset);
    		if ("mediumInset" in $$new_props) $$invalidate(12, mediumInset = $$new_props.mediumInset);
    		if ("largeInset" in $$new_props) $$invalidate(13, largeInset = $$new_props.largeInset);
    		if ("xlargeInset" in $$new_props) $$invalidate(14, xlargeInset = $$new_props.xlargeInset);
    		if ("mediaList" in $$new_props) $$invalidate(15, mediaList = $$new_props.mediaList);
    		if ("sortable" in $$new_props) $$invalidate(16, sortable = $$new_props.sortable);
    		if ("sortableTapHold" in $$new_props) $$invalidate(17, sortableTapHold = $$new_props.sortableTapHold);
    		if ("sortableEnabled" in $$new_props) $$invalidate(18, sortableEnabled = $$new_props.sortableEnabled);
    		if ("sortableMoveElements" in $$new_props) $$invalidate(1, sortableMoveElements = $$new_props.sortableMoveElements);
    		if ("sortableOpposite" in $$new_props) $$invalidate(19, sortableOpposite = $$new_props.sortableOpposite);
    		if ("accordionList" in $$new_props) $$invalidate(20, accordionList = $$new_props.accordionList);
    		if ("accordionOpposite" in $$new_props) $$invalidate(21, accordionOpposite = $$new_props.accordionOpposite);
    		if ("contactsList" in $$new_props) $$invalidate(22, contactsList = $$new_props.contactsList);
    		if ("simpleList" in $$new_props) $$invalidate(23, simpleList = $$new_props.simpleList);
    		if ("linksList" in $$new_props) $$invalidate(24, linksList = $$new_props.linksList);
    		if ("noHairlines" in $$new_props) $$invalidate(25, noHairlines = $$new_props.noHairlines);
    		if ("noHairlinesBetween" in $$new_props) $$invalidate(26, noHairlinesBetween = $$new_props.noHairlinesBetween);
    		if ("noHairlinesMd" in $$new_props) $$invalidate(27, noHairlinesMd = $$new_props.noHairlinesMd);
    		if ("noHairlinesBetweenMd" in $$new_props) $$invalidate(28, noHairlinesBetweenMd = $$new_props.noHairlinesBetweenMd);
    		if ("noHairlinesIos" in $$new_props) $$invalidate(29, noHairlinesIos = $$new_props.noHairlinesIos);
    		if ("noHairlinesBetweenIos" in $$new_props) $$invalidate(30, noHairlinesBetweenIos = $$new_props.noHairlinesBetweenIos);
    		if ("noHairlinesAurora" in $$new_props) $$invalidate(31, noHairlinesAurora = $$new_props.noHairlinesAurora);
    		if ("noHairlinesBetweenAurora" in $$new_props) $$invalidate(32, noHairlinesBetweenAurora = $$new_props.noHairlinesBetweenAurora);
    		if ("noChevron" in $$new_props) $$invalidate(33, noChevron = $$new_props.noChevron);
    		if ("chevronCenter" in $$new_props) $$invalidate(34, chevronCenter = $$new_props.chevronCenter);
    		if ("tab" in $$new_props) $$invalidate(35, tab = $$new_props.tab);
    		if ("tabActive" in $$new_props) $$invalidate(36, tabActive = $$new_props.tabActive);
    		if ("form" in $$new_props) $$invalidate(2, form = $$new_props.form);
    		if ("formStoreData" in $$new_props) $$invalidate(37, formStoreData = $$new_props.formStoreData);
    		if ("inlineLabels" in $$new_props) $$invalidate(38, inlineLabels = $$new_props.inlineLabels);
    		if ("virtualList" in $$new_props) $$invalidate(39, virtualList = $$new_props.virtualList);
    		if ("virtualListParams" in $$new_props) $$invalidate(40, virtualListParams = $$new_props.virtualListParams);
    		if ("$$scope" in $$new_props) $$invalidate(50, $$scope = $$new_props.$$scope);
    	};

    	let hasUlSlots;
    	let classes;

    	$$self.$$.update = () => {
    		 $$invalidate(5, classes = Utils.classNames(
    			className,
    			"list",
    			{
    				inset,
    				"xsmall-inset": xsmallInset,
    				"small-inset": smallInset,
    				"medium-inset": mediumInset,
    				"large-inset": largeInset,
    				"xlarge-inset": xlargeInset,
    				"media-list": mediaList,
    				"simple-list": simpleList,
    				"links-list": linksList,
    				sortable,
    				"sortable-tap-hold": sortableTapHold,
    				"sortable-enabled": sortableEnabled,
    				"sortable-opposite": sortableOpposite,
    				"accordion-list": accordionList,
    				"accordion-opposite": accordionOpposite,
    				"contacts-list": contactsList,
    				"virtual-list": virtualList,
    				tab,
    				"tab-active": tabActive,
    				"no-hairlines": noHairlines,
    				"no-hairlines-md": noHairlinesMd,
    				"no-hairlines-ios": noHairlinesIos,
    				"no-hairlines-aurora": noHairlinesAurora,
    				"no-hairlines-between": noHairlinesBetween,
    				"no-hairlines-between-md": noHairlinesBetweenMd,
    				"no-hairlines-between-ios": noHairlinesBetweenIos,
    				"no-hairlines-between-aurora": noHairlinesBetweenAurora,
    				"form-store-data": formStoreData,
    				"inline-labels": inlineLabels,
    				"no-chevron": noChevron,
    				"chevron-center": chevronCenter
    			},
    			Mixins.colorClasses($$props)
    		));
    	};

    	 $$invalidate(4, hasUlSlots = hasSlots(arguments, "default") || hasSlots(arguments, "list"));
    	$$props = exclude_internal_props($$props);

    	return [
    		ul,
    		sortableMoveElements,
    		form,
    		el,
    		hasUlSlots,
    		classes,
    		onSubmit,
    		$$restProps,
    		className,
    		inset,
    		xsmallInset,
    		smallInset,
    		mediumInset,
    		largeInset,
    		xlargeInset,
    		mediaList,
    		sortable,
    		sortableTapHold,
    		sortableEnabled,
    		sortableOpposite,
    		accordionList,
    		accordionOpposite,
    		contactsList,
    		simpleList,
    		linksList,
    		noHairlines,
    		noHairlinesBetween,
    		noHairlinesMd,
    		noHairlinesBetweenMd,
    		noHairlinesIos,
    		noHairlinesBetweenIos,
    		noHairlinesAurora,
    		noHairlinesBetweenAurora,
    		noChevron,
    		chevronCenter,
    		tab,
    		tabActive,
    		formStoreData,
    		inlineLabels,
    		virtualList,
    		virtualListParams,
    		virtualListInstance,
    		f7VirtualList,
    		dispatch,
    		onSortableEnable,
    		onSortableDisable,
    		onSortableSort,
    		onTabShow,
    		onTabHide,
    		$$props,
    		$$scope,
    		$$slots,
    		form_1_binding,
    		div_binding
    	];
    }

    class List extends SvelteComponent {
    	constructor(options) {
    		super();

    		init(
    			this,
    			options,
    			instance$b,
    			create_fragment$b,
    			safe_not_equal,
    			{
    				class: 8,
    				ul: 0,
    				inset: 9,
    				xsmallInset: 10,
    				smallInset: 11,
    				mediumInset: 12,
    				largeInset: 13,
    				xlargeInset: 14,
    				mediaList: 15,
    				sortable: 16,
    				sortableTapHold: 17,
    				sortableEnabled: 18,
    				sortableMoveElements: 1,
    				sortableOpposite: 19,
    				accordionList: 20,
    				accordionOpposite: 21,
    				contactsList: 22,
    				simpleList: 23,
    				linksList: 24,
    				noHairlines: 25,
    				noHairlinesBetween: 26,
    				noHairlinesMd: 27,
    				noHairlinesBetweenMd: 28,
    				noHairlinesIos: 29,
    				noHairlinesBetweenIos: 30,
    				noHairlinesAurora: 31,
    				noHairlinesBetweenAurora: 32,
    				noChevron: 33,
    				chevronCenter: 34,
    				tab: 35,
    				tabActive: 36,
    				form: 2,
    				formStoreData: 37,
    				inlineLabels: 38,
    				virtualList: 39,
    				virtualListParams: 40,
    				virtualListInstance: 41
    			},
    			[-1, -1]
    		);
    	}

    	get virtualListInstance() {
    		return this.$$.ctx[41];
    	}
    }

    /* public/packages/svelte/components/nav-left.svelte generated by Svelte v3.22.3 */

    function create_if_block$4(ctx) {
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

    function create_fragment$c(ctx) {
    	let div;
    	let t;
    	let current;
    	let if_block = /*backLink*/ ctx[0] && create_if_block$4(ctx);
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
    					if_block = create_if_block$4(ctx);
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

    		init(this, options, instance$c, create_fragment$c, safe_not_equal, {
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

    function create_fragment$d(ctx) {
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
    		init(this, options, instance$d, create_fragment$d, safe_not_equal, { class: 2, sliding: 3 });
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
    function create_if_block$5(ctx) {
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

    function create_fragment$e(ctx) {
    	let div;
    	let t0;
    	let t1;
    	let current;
    	let if_block0 = typeof /*title*/ ctx[0] !== "undefined" && create_if_block_1$4(ctx);
    	let if_block1 = typeof /*subtitle*/ ctx[1] !== "undefined" && create_if_block$5(ctx);
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
    					if_block1 = create_if_block$5(ctx);
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

    		init(this, options, instance$e, create_fragment$e, safe_not_equal, {
    			class: 4,
    			title: 0,
    			subtitle: 1,
    			sliding: 5
    		});
    	}
    }

    /* public/packages/svelte/components/navbar.svelte generated by Svelte v3.22.3 */
    const get_after_inner_slot_changes = dirty => ({});
    const get_after_inner_slot_context = ctx => ({});
    const get_title_large_slot_changes = dirty => ({});
    const get_title_large_slot_context = ctx => ({});
    const get_right_slot_changes = dirty => ({});
    const get_right_slot_context = ctx => ({});
    const get_nav_right_slot_changes = dirty => ({});
    const get_nav_right_slot_context = ctx => ({});
    const get_title_slot_changes$1 = dirty => ({});
    const get_title_slot_context$1 = ctx => ({});
    const get_left_slot_changes = dirty => ({});
    const get_left_slot_context = ctx => ({});
    const get_nav_left_slot_changes = dirty => ({});
    const get_nav_left_slot_context = ctx => ({});
    const get_before_inner_slot_changes = dirty => ({});
    const get_before_inner_slot_context = ctx => ({});

    // (218:4) {#if backLink || hasLeftSlots}
    function create_if_block_3$2(ctx) {
    	let current;

    	const navleft = new Nav_left({
    			props: {
    				backLink: /*backLink*/ ctx[0],
    				backLinkUrl: /*backLinkUrl*/ ctx[1],
    				backLinkForce: /*backLinkForce*/ ctx[2],
    				backLinkShowText: /*backLinkShowText*/ ctx[3],
    				onBackClick: /*onBackClick*/ ctx[15],
    				$$slots: { default: [create_default_slot_2$3] },
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
    function create_default_slot_2$3(ctx) {
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
    function create_if_block_2$4(ctx) {
    	let current;

    	const navtitle = new Nav_title({
    			props: {
    				title: /*title*/ ctx[4],
    				subtitle: /*subtitle*/ ctx[5],
    				$$slots: { default: [create_default_slot_1$3] },
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
    function create_default_slot_1$3(ctx) {
    	let current;
    	const title_slot_template = /*$$slots*/ ctx[57].title;
    	const title_slot = create_slot(title_slot_template, ctx, /*$$scope*/ ctx[59], get_title_slot_context$1);

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
    					title_slot.p(get_slot_context(title_slot_template, ctx, /*$$scope*/ ctx[59], get_title_slot_context$1), get_slot_changes(title_slot_template, /*$$scope*/ ctx[59], dirty, get_title_slot_changes$1));
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
    				$$slots: { default: [create_default_slot$3] },
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
    function create_default_slot$3(ctx) {
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
    function create_if_block$6(ctx) {
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

    function create_fragment$f(ctx) {
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
    	const before_inner_slot = create_slot(before_inner_slot_template, ctx, /*$$scope*/ ctx[59], get_before_inner_slot_context);
    	let if_block0 = (/*backLink*/ ctx[0] || /*hasLeftSlots*/ ctx[8]) && create_if_block_3$2(ctx);
    	let if_block1 = (/*title*/ ctx[4] || /*subtitle*/ ctx[5] || /*hasTitleSlots*/ ctx[10]) && create_if_block_2$4(ctx);
    	let if_block2 = /*hasRightSlots*/ ctx[9] && create_if_block_1$5(ctx);
    	let if_block3 = (/*largeTitle*/ ctx[11] || /*hasTitleLargeSlots*/ ctx[12]) && create_if_block$6(ctx);
    	const default_slot_template = /*$$slots*/ ctx[57].default;
    	const default_slot = create_slot(default_slot_template, ctx, /*$$scope*/ ctx[59], null);
    	const after_inner_slot_template = /*$$slots*/ ctx[57]["after-inner"];
    	const after_inner_slot = create_slot(after_inner_slot_template, ctx, /*$$scope*/ ctx[59], get_after_inner_slot_context);

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
    					before_inner_slot.p(get_slot_context(before_inner_slot_template, ctx, /*$$scope*/ ctx[59], get_before_inner_slot_context), get_slot_changes(before_inner_slot_template, /*$$scope*/ ctx[59], dirty, get_before_inner_slot_changes));
    				}
    			}

    			if (/*backLink*/ ctx[0] || /*hasLeftSlots*/ ctx[8]) {
    				if (if_block0) {
    					if_block0.p(ctx, dirty);

    					if (dirty[0] & /*backLink, hasLeftSlots*/ 257) {
    						transition_in(if_block0, 1);
    					}
    				} else {
    					if_block0 = create_if_block_3$2(ctx);
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
    					if_block1 = create_if_block_2$4(ctx);
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
    					if_block3 = create_if_block$6(ctx);
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
    					after_inner_slot.p(get_slot_context(after_inner_slot_template, ctx, /*$$scope*/ ctx[59], get_after_inner_slot_context), get_slot_changes(after_inner_slot_template, /*$$scope*/ ctx[59], dirty, get_after_inner_slot_changes));
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
    			create_fragment$f,
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

    function create_else_block$2(ctx) {
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
    function create_if_block_2$5(ctx) {
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
    function create_if_block$7(ctx) {
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

    function create_fragment$g(ctx) {
    	let span;

    	function select_block_type(ctx, dirty) {
    		if (/*_theme*/ ctx[0] && /*_theme*/ ctx[0].md) return create_if_block$7;
    		if (/*_theme*/ ctx[0] && /*_theme*/ ctx[0].ios) return create_if_block_1$6;
    		if (/*_theme*/ ctx[0] && /*_theme*/ ctx[0].aurora) return create_if_block_2$5;
    		return create_else_block$2;
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
    		init(this, options, instance$g, create_fragment$g, safe_not_equal, { style: 4, class: 5, size: 6 });
    	}
    }

    /* public/packages/svelte/components/page-content.svelte generated by Svelte v3.22.3 */

    function create_if_block_3$3(ctx) {
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
    function create_if_block_2$6(ctx) {
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
    function create_if_block$8(ctx) {
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

    function create_fragment$h(ctx) {
    	let div;
    	let t0;
    	let t1;
    	let t2;
    	let t3;
    	let current;
    	let if_block0 = /*ptr*/ ctx[0] && /*ptrPreloader*/ ctx[2] && !/*ptrBottom*/ ctx[3] && create_if_block_3$3();
    	let if_block1 = /*infinite*/ ctx[5] && /*infiniteTop*/ ctx[6] && /*infinitePreloader*/ ctx[8] && create_if_block_2$6();
    	const default_slot_template = /*$$slots*/ ctx[33].default;
    	const default_slot = create_slot(default_slot_template, ctx, /*$$scope*/ ctx[32], null);
    	let if_block2 = /*infinite*/ ctx[5] && !/*infiniteTop*/ ctx[6] && /*infinitePreloader*/ ctx[8] && create_if_block_1$7();
    	let if_block3 = /*ptr*/ ctx[0] && /*ptrPreloader*/ ctx[2] && /*ptrBottom*/ ctx[3] && create_if_block$8();

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
    					if_block0 = create_if_block_3$3();
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
    					if_block1 = create_if_block_2$6();
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
    					if_block3 = create_if_block$8();
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
    			create_fragment$h,
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
    function create_else_block$3(ctx) {
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
    function create_if_block$9(ctx) {
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
    				$$slots: { default: [create_default_slot$4] },
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
    function create_default_slot$4(ctx) {
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

    function create_fragment$i(ctx) {
    	let div;
    	let t;
    	let current_block_type_index;
    	let if_block;
    	let current;
    	const fixed_slot_template = /*$$slots*/ ctx[71].fixed;
    	const fixed_slot = create_slot(fixed_slot_template, ctx, /*$$scope*/ ctx[73], get_fixed_slot_context);
    	const if_block_creators = [create_if_block$9, create_else_block$3];
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
    			create_fragment$i,
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

    function create_fragment$j(ctx) {
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

    function instance_1($$self, $$props, $$invalidate) {
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

    		init(this, options, instance_1, create_fragment$j, safe_not_equal, {
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

    /* src/pug/docs-demos/svelte/cards.svelte generated by Svelte v3.22.3 */

    function create_default_slot_55(ctx) {
    	let t;

    	return {
    		c() {
    			t = text("Simple Cards");
    		},
    		m(target, anchor) {
    			insert(target, t, anchor);
    		},
    		d(detaching) {
    			if (detaching) detach(t);
    		}
    	};
    }

    // (19:6) <BlockTitle>
    function create_default_slot_54(ctx) {
    	let t;

    	return {
    		c() {
    			t = text("Outline Cards");
    		},
    		m(target, anchor) {
    			insert(target, t, anchor);
    		},
    		d(detaching) {
    			if (detaching) detach(t);
    		}
    	};
    }

    // (35:6) <BlockTitle>
    function create_default_slot_53(ctx) {
    	let t;

    	return {
    		c() {
    			t = text("Styled Cards");
    		},
    		m(target, anchor) {
    			insert(target, t, anchor);
    		},
    		d(detaching) {
    			if (detaching) detach(t);
    		}
    	};
    }

    // (37:8) <CardHeader           class="no-border"           valign="bottom"           style="background-image: url(https://cdn.framework7.io/placeholder/nature-1000x600-3.jpg)"         >
    function create_default_slot_52(ctx) {
    	let t;

    	return {
    		c() {
    			t = text("Journey To Mountains");
    		},
    		m(target, anchor) {
    			insert(target, t, anchor);
    		},
    		d(detaching) {
    			if (detaching) detach(t);
    		}
    	};
    }

    // (42:8) <CardContent>
    function create_default_slot_51(ctx) {
    	let p0;
    	let t1;
    	let p1;

    	return {
    		c() {
    			p0 = element("p");
    			p0.textContent = "Posted on January 21, 2015";
    			t1 = space();
    			p1 = element("p");
    			p1.textContent = "Quisque eget vestibulum nulla. Quisque quis dui quis ex ultricies efficitur vitae non felis. Phasellus quis nibh hendrerit...";
    			attr(p0, "class", "date");
    		},
    		m(target, anchor) {
    			insert(target, p0, anchor);
    			insert(target, t1, anchor);
    			insert(target, p1, anchor);
    		},
    		d(detaching) {
    			if (detaching) detach(p0);
    			if (detaching) detach(t1);
    			if (detaching) detach(p1);
    		}
    	};
    }

    // (47:10) <Link>
    function create_default_slot_50(ctx) {
    	let t;

    	return {
    		c() {
    			t = text("Like");
    		},
    		m(target, anchor) {
    			insert(target, t, anchor);
    		},
    		d(detaching) {
    			if (detaching) detach(t);
    		}
    	};
    }

    // (48:10) <Link>
    function create_default_slot_49(ctx) {
    	let t;

    	return {
    		c() {
    			t = text("Read more");
    		},
    		m(target, anchor) {
    			insert(target, t, anchor);
    		},
    		d(detaching) {
    			if (detaching) detach(t);
    		}
    	};
    }

    // (46:8) <CardFooter>
    function create_default_slot_48(ctx) {
    	let t;
    	let current;

    	const link0 = new Link({
    			props: {
    				$$slots: { default: [create_default_slot_50] },
    				$$scope: { ctx }
    			}
    		});

    	const link1 = new Link({
    			props: {
    				$$slots: { default: [create_default_slot_49] },
    				$$scope: { ctx }
    			}
    		});

    	return {
    		c() {
    			create_component(link0.$$.fragment);
    			t = space();
    			create_component(link1.$$.fragment);
    		},
    		m(target, anchor) {
    			mount_component(link0, target, anchor);
    			insert(target, t, anchor);
    			mount_component(link1, target, anchor);
    			current = true;
    		},
    		p(ctx, dirty) {
    			const link0_changes = {};

    			if (dirty & /*$$scope*/ 1) {
    				link0_changes.$$scope = { dirty, ctx };
    			}

    			link0.$set(link0_changes);
    			const link1_changes = {};

    			if (dirty & /*$$scope*/ 1) {
    				link1_changes.$$scope = { dirty, ctx };
    			}

    			link1.$set(link1_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(link0.$$.fragment, local);
    			transition_in(link1.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(link0.$$.fragment, local);
    			transition_out(link1.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			destroy_component(link0, detaching);
    			if (detaching) detach(t);
    			destroy_component(link1, detaching);
    		}
    	};
    }

    // (36:6) <Card class="demo-card-header-pic">
    function create_default_slot_47(ctx) {
    	let t0;
    	let t1;
    	let current;

    	const cardheader = new Card_header({
    			props: {
    				class: "no-border",
    				valign: "bottom",
    				style: "background-image: url(https://cdn.framework7.io/placeholder/nature-1000x600-3.jpg)",
    				$$slots: { default: [create_default_slot_52] },
    				$$scope: { ctx }
    			}
    		});

    	const cardcontent = new Card_content({
    			props: {
    				$$slots: { default: [create_default_slot_51] },
    				$$scope: { ctx }
    			}
    		});

    	const cardfooter = new Card_footer({
    			props: {
    				$$slots: { default: [create_default_slot_48] },
    				$$scope: { ctx }
    			}
    		});

    	return {
    		c() {
    			create_component(cardheader.$$.fragment);
    			t0 = space();
    			create_component(cardcontent.$$.fragment);
    			t1 = space();
    			create_component(cardfooter.$$.fragment);
    		},
    		m(target, anchor) {
    			mount_component(cardheader, target, anchor);
    			insert(target, t0, anchor);
    			mount_component(cardcontent, target, anchor);
    			insert(target, t1, anchor);
    			mount_component(cardfooter, target, anchor);
    			current = true;
    		},
    		p(ctx, dirty) {
    			const cardheader_changes = {};

    			if (dirty & /*$$scope*/ 1) {
    				cardheader_changes.$$scope = { dirty, ctx };
    			}

    			cardheader.$set(cardheader_changes);
    			const cardcontent_changes = {};

    			if (dirty & /*$$scope*/ 1) {
    				cardcontent_changes.$$scope = { dirty, ctx };
    			}

    			cardcontent.$set(cardcontent_changes);
    			const cardfooter_changes = {};

    			if (dirty & /*$$scope*/ 1) {
    				cardfooter_changes.$$scope = { dirty, ctx };
    			}

    			cardfooter.$set(cardfooter_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(cardheader.$$.fragment, local);
    			transition_in(cardcontent.$$.fragment, local);
    			transition_in(cardfooter.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(cardheader.$$.fragment, local);
    			transition_out(cardcontent.$$.fragment, local);
    			transition_out(cardfooter.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			destroy_component(cardheader, detaching);
    			if (detaching) detach(t0);
    			destroy_component(cardcontent, detaching);
    			if (detaching) detach(t1);
    			destroy_component(cardfooter, detaching);
    		}
    	};
    }

    // (52:8) <CardHeader           class="no-border"           valign="bottom"           style="background-image: url(https://cdn.framework7.io/placeholder/people-1000x600-6.jpg)"         >
    function create_default_slot_46(ctx) {
    	let t;

    	return {
    		c() {
    			t = text("Journey To Mountains");
    		},
    		m(target, anchor) {
    			insert(target, t, anchor);
    		},
    		d(detaching) {
    			if (detaching) detach(t);
    		}
    	};
    }

    // (57:8) <CardContent>
    function create_default_slot_45(ctx) {
    	let p0;
    	let t1;
    	let p1;

    	return {
    		c() {
    			p0 = element("p");
    			p0.textContent = "Posted on January 21, 2015";
    			t1 = space();
    			p1 = element("p");
    			p1.textContent = "Quisque eget vestibulum nulla. Quisque quis dui quis ex ultricies efficitur vitae non felis. Phasellus quis nibh hendrerit...";
    			attr(p0, "class", "date");
    		},
    		m(target, anchor) {
    			insert(target, p0, anchor);
    			insert(target, t1, anchor);
    			insert(target, p1, anchor);
    		},
    		d(detaching) {
    			if (detaching) detach(p0);
    			if (detaching) detach(t1);
    			if (detaching) detach(p1);
    		}
    	};
    }

    // (62:10) <Link>
    function create_default_slot_44(ctx) {
    	let t;

    	return {
    		c() {
    			t = text("Like");
    		},
    		m(target, anchor) {
    			insert(target, t, anchor);
    		},
    		d(detaching) {
    			if (detaching) detach(t);
    		}
    	};
    }

    // (63:10) <Link>
    function create_default_slot_43(ctx) {
    	let t;

    	return {
    		c() {
    			t = text("Read more");
    		},
    		m(target, anchor) {
    			insert(target, t, anchor);
    		},
    		d(detaching) {
    			if (detaching) detach(t);
    		}
    	};
    }

    // (61:8) <CardFooter>
    function create_default_slot_42(ctx) {
    	let t;
    	let current;

    	const link0 = new Link({
    			props: {
    				$$slots: { default: [create_default_slot_44] },
    				$$scope: { ctx }
    			}
    		});

    	const link1 = new Link({
    			props: {
    				$$slots: { default: [create_default_slot_43] },
    				$$scope: { ctx }
    			}
    		});

    	return {
    		c() {
    			create_component(link0.$$.fragment);
    			t = space();
    			create_component(link1.$$.fragment);
    		},
    		m(target, anchor) {
    			mount_component(link0, target, anchor);
    			insert(target, t, anchor);
    			mount_component(link1, target, anchor);
    			current = true;
    		},
    		p(ctx, dirty) {
    			const link0_changes = {};

    			if (dirty & /*$$scope*/ 1) {
    				link0_changes.$$scope = { dirty, ctx };
    			}

    			link0.$set(link0_changes);
    			const link1_changes = {};

    			if (dirty & /*$$scope*/ 1) {
    				link1_changes.$$scope = { dirty, ctx };
    			}

    			link1.$set(link1_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(link0.$$.fragment, local);
    			transition_in(link1.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(link0.$$.fragment, local);
    			transition_out(link1.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			destroy_component(link0, detaching);
    			if (detaching) detach(t);
    			destroy_component(link1, detaching);
    		}
    	};
    }

    // (51:6) <Card class="demo-card-header-pic">
    function create_default_slot_41(ctx) {
    	let t0;
    	let t1;
    	let current;

    	const cardheader = new Card_header({
    			props: {
    				class: "no-border",
    				valign: "bottom",
    				style: "background-image: url(https://cdn.framework7.io/placeholder/people-1000x600-6.jpg)",
    				$$slots: { default: [create_default_slot_46] },
    				$$scope: { ctx }
    			}
    		});

    	const cardcontent = new Card_content({
    			props: {
    				$$slots: { default: [create_default_slot_45] },
    				$$scope: { ctx }
    			}
    		});

    	const cardfooter = new Card_footer({
    			props: {
    				$$slots: { default: [create_default_slot_42] },
    				$$scope: { ctx }
    			}
    		});

    	return {
    		c() {
    			create_component(cardheader.$$.fragment);
    			t0 = space();
    			create_component(cardcontent.$$.fragment);
    			t1 = space();
    			create_component(cardfooter.$$.fragment);
    		},
    		m(target, anchor) {
    			mount_component(cardheader, target, anchor);
    			insert(target, t0, anchor);
    			mount_component(cardcontent, target, anchor);
    			insert(target, t1, anchor);
    			mount_component(cardfooter, target, anchor);
    			current = true;
    		},
    		p(ctx, dirty) {
    			const cardheader_changes = {};

    			if (dirty & /*$$scope*/ 1) {
    				cardheader_changes.$$scope = { dirty, ctx };
    			}

    			cardheader.$set(cardheader_changes);
    			const cardcontent_changes = {};

    			if (dirty & /*$$scope*/ 1) {
    				cardcontent_changes.$$scope = { dirty, ctx };
    			}

    			cardcontent.$set(cardcontent_changes);
    			const cardfooter_changes = {};

    			if (dirty & /*$$scope*/ 1) {
    				cardfooter_changes.$$scope = { dirty, ctx };
    			}

    			cardfooter.$set(cardfooter_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(cardheader.$$.fragment, local);
    			transition_in(cardcontent.$$.fragment, local);
    			transition_in(cardfooter.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(cardheader.$$.fragment, local);
    			transition_out(cardcontent.$$.fragment, local);
    			transition_out(cardfooter.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			destroy_component(cardheader, detaching);
    			if (detaching) detach(t0);
    			destroy_component(cardcontent, detaching);
    			if (detaching) detach(t1);
    			destroy_component(cardfooter, detaching);
    		}
    	};
    }

    // (67:6) <BlockTitle>
    function create_default_slot_40(ctx) {
    	let t;

    	return {
    		c() {
    			t = text("Facebook Cards");
    		},
    		m(target, anchor) {
    			insert(target, t, anchor);
    		},
    		d(detaching) {
    			if (detaching) detach(t);
    		}
    	};
    }

    // (69:8) <CardHeader class="no-border">
    function create_default_slot_39(ctx) {
    	let div0;
    	let t0;
    	let div1;
    	let t2;
    	let div2;

    	return {
    		c() {
    			div0 = element("div");
    			div0.innerHTML = `<img src="https://cdn.framework7.io/placeholder/people-68x68-1.jpg" width="34" height="34">`;
    			t0 = space();
    			div1 = element("div");
    			div1.textContent = "John Doe";
    			t2 = space();
    			div2 = element("div");
    			div2.textContent = "Monday at 3:47 PM";
    			attr(div0, "class", "demo-facebook-avatar");
    			attr(div1, "class", "demo-facebook-name");
    			attr(div2, "class", "demo-facebook-date");
    		},
    		m(target, anchor) {
    			insert(target, div0, anchor);
    			insert(target, t0, anchor);
    			insert(target, div1, anchor);
    			insert(target, t2, anchor);
    			insert(target, div2, anchor);
    		},
    		d(detaching) {
    			if (detaching) detach(div0);
    			if (detaching) detach(t0);
    			if (detaching) detach(div1);
    			if (detaching) detach(t2);
    			if (detaching) detach(div2);
    		}
    	};
    }

    // (74:8) <CardContent padding={false}>
    function create_default_slot_38(ctx) {
    	let img;
    	let img_src_value;

    	return {
    		c() {
    			img = element("img");
    			if (img.src !== (img_src_value = "https://cdn.framework7.io/placeholder/nature-1000x700-8.jpg")) attr(img, "src", img_src_value);
    			attr(img, "width", "100%");
    		},
    		m(target, anchor) {
    			insert(target, img, anchor);
    		},
    		d(detaching) {
    			if (detaching) detach(img);
    		}
    	};
    }

    // (78:10) <Link>
    function create_default_slot_37(ctx) {
    	let t;

    	return {
    		c() {
    			t = text("Like");
    		},
    		m(target, anchor) {
    			insert(target, t, anchor);
    		},
    		d(detaching) {
    			if (detaching) detach(t);
    		}
    	};
    }

    // (79:10) <Link>
    function create_default_slot_36(ctx) {
    	let t;

    	return {
    		c() {
    			t = text("Comment");
    		},
    		m(target, anchor) {
    			insert(target, t, anchor);
    		},
    		d(detaching) {
    			if (detaching) detach(t);
    		}
    	};
    }

    // (80:10) <Link>
    function create_default_slot_35(ctx) {
    	let t;

    	return {
    		c() {
    			t = text("Share");
    		},
    		m(target, anchor) {
    			insert(target, t, anchor);
    		},
    		d(detaching) {
    			if (detaching) detach(t);
    		}
    	};
    }

    // (77:8) <CardFooter class="no-border">
    function create_default_slot_34(ctx) {
    	let t0;
    	let t1;
    	let current;

    	const link0 = new Link({
    			props: {
    				$$slots: { default: [create_default_slot_37] },
    				$$scope: { ctx }
    			}
    		});

    	const link1 = new Link({
    			props: {
    				$$slots: { default: [create_default_slot_36] },
    				$$scope: { ctx }
    			}
    		});

    	const link2 = new Link({
    			props: {
    				$$slots: { default: [create_default_slot_35] },
    				$$scope: { ctx }
    			}
    		});

    	return {
    		c() {
    			create_component(link0.$$.fragment);
    			t0 = space();
    			create_component(link1.$$.fragment);
    			t1 = space();
    			create_component(link2.$$.fragment);
    		},
    		m(target, anchor) {
    			mount_component(link0, target, anchor);
    			insert(target, t0, anchor);
    			mount_component(link1, target, anchor);
    			insert(target, t1, anchor);
    			mount_component(link2, target, anchor);
    			current = true;
    		},
    		p(ctx, dirty) {
    			const link0_changes = {};

    			if (dirty & /*$$scope*/ 1) {
    				link0_changes.$$scope = { dirty, ctx };
    			}

    			link0.$set(link0_changes);
    			const link1_changes = {};

    			if (dirty & /*$$scope*/ 1) {
    				link1_changes.$$scope = { dirty, ctx };
    			}

    			link1.$set(link1_changes);
    			const link2_changes = {};

    			if (dirty & /*$$scope*/ 1) {
    				link2_changes.$$scope = { dirty, ctx };
    			}

    			link2.$set(link2_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(link0.$$.fragment, local);
    			transition_in(link1.$$.fragment, local);
    			transition_in(link2.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(link0.$$.fragment, local);
    			transition_out(link1.$$.fragment, local);
    			transition_out(link2.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			destroy_component(link0, detaching);
    			if (detaching) detach(t0);
    			destroy_component(link1, detaching);
    			if (detaching) detach(t1);
    			destroy_component(link2, detaching);
    		}
    	};
    }

    // (68:6) <Card class="demo-facebook-card">
    function create_default_slot_33(ctx) {
    	let t0;
    	let t1;
    	let current;

    	const cardheader = new Card_header({
    			props: {
    				class: "no-border",
    				$$slots: { default: [create_default_slot_39] },
    				$$scope: { ctx }
    			}
    		});

    	const cardcontent = new Card_content({
    			props: {
    				padding: false,
    				$$slots: { default: [create_default_slot_38] },
    				$$scope: { ctx }
    			}
    		});

    	const cardfooter = new Card_footer({
    			props: {
    				class: "no-border",
    				$$slots: { default: [create_default_slot_34] },
    				$$scope: { ctx }
    			}
    		});

    	return {
    		c() {
    			create_component(cardheader.$$.fragment);
    			t0 = space();
    			create_component(cardcontent.$$.fragment);
    			t1 = space();
    			create_component(cardfooter.$$.fragment);
    		},
    		m(target, anchor) {
    			mount_component(cardheader, target, anchor);
    			insert(target, t0, anchor);
    			mount_component(cardcontent, target, anchor);
    			insert(target, t1, anchor);
    			mount_component(cardfooter, target, anchor);
    			current = true;
    		},
    		p(ctx, dirty) {
    			const cardheader_changes = {};

    			if (dirty & /*$$scope*/ 1) {
    				cardheader_changes.$$scope = { dirty, ctx };
    			}

    			cardheader.$set(cardheader_changes);
    			const cardcontent_changes = {};

    			if (dirty & /*$$scope*/ 1) {
    				cardcontent_changes.$$scope = { dirty, ctx };
    			}

    			cardcontent.$set(cardcontent_changes);
    			const cardfooter_changes = {};

    			if (dirty & /*$$scope*/ 1) {
    				cardfooter_changes.$$scope = { dirty, ctx };
    			}

    			cardfooter.$set(cardfooter_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(cardheader.$$.fragment, local);
    			transition_in(cardcontent.$$.fragment, local);
    			transition_in(cardfooter.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(cardheader.$$.fragment, local);
    			transition_out(cardcontent.$$.fragment, local);
    			transition_out(cardfooter.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			destroy_component(cardheader, detaching);
    			if (detaching) detach(t0);
    			destroy_component(cardcontent, detaching);
    			if (detaching) detach(t1);
    			destroy_component(cardfooter, detaching);
    		}
    	};
    }

    // (84:8) <CardHeader class="no-border">
    function create_default_slot_32(ctx) {
    	let div0;
    	let t0;
    	let div1;
    	let t2;
    	let div2;

    	return {
    		c() {
    			div0 = element("div");
    			div0.innerHTML = `<img src="https://cdn.framework7.io/placeholder/people-68x68-1.jpg" width="34" height="34">`;
    			t0 = space();
    			div1 = element("div");
    			div1.textContent = "John Doe";
    			t2 = space();
    			div2 = element("div");
    			div2.textContent = "Monday at 2:15 PM";
    			attr(div0, "class", "demo-facebook-avatar");
    			attr(div1, "class", "demo-facebook-name");
    			attr(div2, "class", "demo-facebook-date");
    		},
    		m(target, anchor) {
    			insert(target, div0, anchor);
    			insert(target, t0, anchor);
    			insert(target, div1, anchor);
    			insert(target, t2, anchor);
    			insert(target, div2, anchor);
    		},
    		d(detaching) {
    			if (detaching) detach(div0);
    			if (detaching) detach(t0);
    			if (detaching) detach(div1);
    			if (detaching) detach(t2);
    			if (detaching) detach(div2);
    		}
    	};
    }

    // (89:8) <CardContent>
    function create_default_slot_31(ctx) {
    	let p0;
    	let img;
    	let img_src_value;
    	let t1;
    	let p1;

    	return {
    		c() {
    			p0 = element("p");
    			p0.textContent = "What a nice photo i took yesterday!";
    			img = element("img");
    			t1 = space();
    			p1 = element("p");
    			p1.textContent = "Likes: 112    Comments: 43";
    			if (img.src !== (img_src_value = "https://cdn.framework7.io/placeholder/nature-1000x700-8.jpg")) attr(img, "src", img_src_value);
    			attr(img, "width", "100%");
    			attr(p1, "class", "likes");
    		},
    		m(target, anchor) {
    			insert(target, p0, anchor);
    			insert(target, img, anchor);
    			insert(target, t1, anchor);
    			insert(target, p1, anchor);
    		},
    		d(detaching) {
    			if (detaching) detach(p0);
    			if (detaching) detach(img);
    			if (detaching) detach(t1);
    			if (detaching) detach(p1);
    		}
    	};
    }

    // (94:10) <Link>
    function create_default_slot_30(ctx) {
    	let t;

    	return {
    		c() {
    			t = text("Like");
    		},
    		m(target, anchor) {
    			insert(target, t, anchor);
    		},
    		d(detaching) {
    			if (detaching) detach(t);
    		}
    	};
    }

    // (95:10) <Link>
    function create_default_slot_29(ctx) {
    	let t;

    	return {
    		c() {
    			t = text("Comment");
    		},
    		m(target, anchor) {
    			insert(target, t, anchor);
    		},
    		d(detaching) {
    			if (detaching) detach(t);
    		}
    	};
    }

    // (96:10) <Link>
    function create_default_slot_28(ctx) {
    	let t;

    	return {
    		c() {
    			t = text("Share");
    		},
    		m(target, anchor) {
    			insert(target, t, anchor);
    		},
    		d(detaching) {
    			if (detaching) detach(t);
    		}
    	};
    }

    // (93:8) <CardFooter class="no-border">
    function create_default_slot_27(ctx) {
    	let t0;
    	let t1;
    	let current;

    	const link0 = new Link({
    			props: {
    				$$slots: { default: [create_default_slot_30] },
    				$$scope: { ctx }
    			}
    		});

    	const link1 = new Link({
    			props: {
    				$$slots: { default: [create_default_slot_29] },
    				$$scope: { ctx }
    			}
    		});

    	const link2 = new Link({
    			props: {
    				$$slots: { default: [create_default_slot_28] },
    				$$scope: { ctx }
    			}
    		});

    	return {
    		c() {
    			create_component(link0.$$.fragment);
    			t0 = space();
    			create_component(link1.$$.fragment);
    			t1 = space();
    			create_component(link2.$$.fragment);
    		},
    		m(target, anchor) {
    			mount_component(link0, target, anchor);
    			insert(target, t0, anchor);
    			mount_component(link1, target, anchor);
    			insert(target, t1, anchor);
    			mount_component(link2, target, anchor);
    			current = true;
    		},
    		p(ctx, dirty) {
    			const link0_changes = {};

    			if (dirty & /*$$scope*/ 1) {
    				link0_changes.$$scope = { dirty, ctx };
    			}

    			link0.$set(link0_changes);
    			const link1_changes = {};

    			if (dirty & /*$$scope*/ 1) {
    				link1_changes.$$scope = { dirty, ctx };
    			}

    			link1.$set(link1_changes);
    			const link2_changes = {};

    			if (dirty & /*$$scope*/ 1) {
    				link2_changes.$$scope = { dirty, ctx };
    			}

    			link2.$set(link2_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(link0.$$.fragment, local);
    			transition_in(link1.$$.fragment, local);
    			transition_in(link2.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(link0.$$.fragment, local);
    			transition_out(link1.$$.fragment, local);
    			transition_out(link2.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			destroy_component(link0, detaching);
    			if (detaching) detach(t0);
    			destroy_component(link1, detaching);
    			if (detaching) detach(t1);
    			destroy_component(link2, detaching);
    		}
    	};
    }

    // (83:6) <Card class="demo-facebook-card">
    function create_default_slot_26(ctx) {
    	let t0;
    	let t1;
    	let current;

    	const cardheader = new Card_header({
    			props: {
    				class: "no-border",
    				$$slots: { default: [create_default_slot_32] },
    				$$scope: { ctx }
    			}
    		});

    	const cardcontent = new Card_content({
    			props: {
    				$$slots: { default: [create_default_slot_31] },
    				$$scope: { ctx }
    			}
    		});

    	const cardfooter = new Card_footer({
    			props: {
    				class: "no-border",
    				$$slots: { default: [create_default_slot_27] },
    				$$scope: { ctx }
    			}
    		});

    	return {
    		c() {
    			create_component(cardheader.$$.fragment);
    			t0 = space();
    			create_component(cardcontent.$$.fragment);
    			t1 = space();
    			create_component(cardfooter.$$.fragment);
    		},
    		m(target, anchor) {
    			mount_component(cardheader, target, anchor);
    			insert(target, t0, anchor);
    			mount_component(cardcontent, target, anchor);
    			insert(target, t1, anchor);
    			mount_component(cardfooter, target, anchor);
    			current = true;
    		},
    		p(ctx, dirty) {
    			const cardheader_changes = {};

    			if (dirty & /*$$scope*/ 1) {
    				cardheader_changes.$$scope = { dirty, ctx };
    			}

    			cardheader.$set(cardheader_changes);
    			const cardcontent_changes = {};

    			if (dirty & /*$$scope*/ 1) {
    				cardcontent_changes.$$scope = { dirty, ctx };
    			}

    			cardcontent.$set(cardcontent_changes);
    			const cardfooter_changes = {};

    			if (dirty & /*$$scope*/ 1) {
    				cardfooter_changes.$$scope = { dirty, ctx };
    			}

    			cardfooter.$set(cardfooter_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(cardheader.$$.fragment, local);
    			transition_in(cardcontent.$$.fragment, local);
    			transition_in(cardfooter.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(cardheader.$$.fragment, local);
    			transition_out(cardcontent.$$.fragment, local);
    			transition_out(cardfooter.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			destroy_component(cardheader, detaching);
    			if (detaching) detach(t0);
    			destroy_component(cardcontent, detaching);
    			if (detaching) detach(t1);
    			destroy_component(cardfooter, detaching);
    		}
    	};
    }

    // (100:6) <BlockTitle>
    function create_default_slot_25(ctx) {
    	let t;

    	return {
    		c() {
    			t = text("Cards With List View");
    		},
    		m(target, anchor) {
    			insert(target, t, anchor);
    		},
    		d(detaching) {
    			if (detaching) detach(t);
    		}
    	};
    }

    // (104:12) <ListItem link="#">
    function create_default_slot_24(ctx) {
    	let t;

    	return {
    		c() {
    			t = text("Link 1");
    		},
    		m(target, anchor) {
    			insert(target, t, anchor);
    		},
    		d(detaching) {
    			if (detaching) detach(t);
    		}
    	};
    }

    // (105:12) <ListItem link="#">
    function create_default_slot_23(ctx) {
    	let t;

    	return {
    		c() {
    			t = text("Link 2");
    		},
    		m(target, anchor) {
    			insert(target, t, anchor);
    		},
    		d(detaching) {
    			if (detaching) detach(t);
    		}
    	};
    }

    // (106:12) <ListItem link="#">
    function create_default_slot_22(ctx) {
    	let t;

    	return {
    		c() {
    			t = text("Link 3");
    		},
    		m(target, anchor) {
    			insert(target, t, anchor);
    		},
    		d(detaching) {
    			if (detaching) detach(t);
    		}
    	};
    }

    // (107:12) <ListItem link="#">
    function create_default_slot_21(ctx) {
    	let t;

    	return {
    		c() {
    			t = text("Link 4");
    		},
    		m(target, anchor) {
    			insert(target, t, anchor);
    		},
    		d(detaching) {
    			if (detaching) detach(t);
    		}
    	};
    }

    // (108:12) <ListItem link="#">
    function create_default_slot_20(ctx) {
    	let t;

    	return {
    		c() {
    			t = text("Link 5");
    		},
    		m(target, anchor) {
    			insert(target, t, anchor);
    		},
    		d(detaching) {
    			if (detaching) detach(t);
    		}
    	};
    }

    // (103:10) <List>
    function create_default_slot_19(ctx) {
    	let t0;
    	let t1;
    	let t2;
    	let t3;
    	let current;

    	const listitem0 = new List_item({
    			props: {
    				link: "#",
    				$$slots: { default: [create_default_slot_24] },
    				$$scope: { ctx }
    			}
    		});

    	const listitem1 = new List_item({
    			props: {
    				link: "#",
    				$$slots: { default: [create_default_slot_23] },
    				$$scope: { ctx }
    			}
    		});

    	const listitem2 = new List_item({
    			props: {
    				link: "#",
    				$$slots: { default: [create_default_slot_22] },
    				$$scope: { ctx }
    			}
    		});

    	const listitem3 = new List_item({
    			props: {
    				link: "#",
    				$$slots: { default: [create_default_slot_21] },
    				$$scope: { ctx }
    			}
    		});

    	const listitem4 = new List_item({
    			props: {
    				link: "#",
    				$$slots: { default: [create_default_slot_20] },
    				$$scope: { ctx }
    			}
    		});

    	return {
    		c() {
    			create_component(listitem0.$$.fragment);
    			t0 = space();
    			create_component(listitem1.$$.fragment);
    			t1 = space();
    			create_component(listitem2.$$.fragment);
    			t2 = space();
    			create_component(listitem3.$$.fragment);
    			t3 = space();
    			create_component(listitem4.$$.fragment);
    		},
    		m(target, anchor) {
    			mount_component(listitem0, target, anchor);
    			insert(target, t0, anchor);
    			mount_component(listitem1, target, anchor);
    			insert(target, t1, anchor);
    			mount_component(listitem2, target, anchor);
    			insert(target, t2, anchor);
    			mount_component(listitem3, target, anchor);
    			insert(target, t3, anchor);
    			mount_component(listitem4, target, anchor);
    			current = true;
    		},
    		p(ctx, dirty) {
    			const listitem0_changes = {};

    			if (dirty & /*$$scope*/ 1) {
    				listitem0_changes.$$scope = { dirty, ctx };
    			}

    			listitem0.$set(listitem0_changes);
    			const listitem1_changes = {};

    			if (dirty & /*$$scope*/ 1) {
    				listitem1_changes.$$scope = { dirty, ctx };
    			}

    			listitem1.$set(listitem1_changes);
    			const listitem2_changes = {};

    			if (dirty & /*$$scope*/ 1) {
    				listitem2_changes.$$scope = { dirty, ctx };
    			}

    			listitem2.$set(listitem2_changes);
    			const listitem3_changes = {};

    			if (dirty & /*$$scope*/ 1) {
    				listitem3_changes.$$scope = { dirty, ctx };
    			}

    			listitem3.$set(listitem3_changes);
    			const listitem4_changes = {};

    			if (dirty & /*$$scope*/ 1) {
    				listitem4_changes.$$scope = { dirty, ctx };
    			}

    			listitem4.$set(listitem4_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(listitem0.$$.fragment, local);
    			transition_in(listitem1.$$.fragment, local);
    			transition_in(listitem2.$$.fragment, local);
    			transition_in(listitem3.$$.fragment, local);
    			transition_in(listitem4.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(listitem0.$$.fragment, local);
    			transition_out(listitem1.$$.fragment, local);
    			transition_out(listitem2.$$.fragment, local);
    			transition_out(listitem3.$$.fragment, local);
    			transition_out(listitem4.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			destroy_component(listitem0, detaching);
    			if (detaching) detach(t0);
    			destroy_component(listitem1, detaching);
    			if (detaching) detach(t1);
    			destroy_component(listitem2, detaching);
    			if (detaching) detach(t2);
    			destroy_component(listitem3, detaching);
    			if (detaching) detach(t3);
    			destroy_component(listitem4, detaching);
    		}
    	};
    }

    // (102:8) <CardContent padding={false}>
    function create_default_slot_18(ctx) {
    	let current;

    	const list = new List({
    			props: {
    				$$slots: { default: [create_default_slot_19] },
    				$$scope: { ctx }
    			}
    		});

    	return {
    		c() {
    			create_component(list.$$.fragment);
    		},
    		m(target, anchor) {
    			mount_component(list, target, anchor);
    			current = true;
    		},
    		p(ctx, dirty) {
    			const list_changes = {};

    			if (dirty & /*$$scope*/ 1) {
    				list_changes.$$scope = { dirty, ctx };
    			}

    			list.$set(list_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(list.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(list.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			destroy_component(list, detaching);
    		}
    	};
    }

    // (101:6) <Card>
    function create_default_slot_17(ctx) {
    	let current;

    	const cardcontent = new Card_content({
    			props: {
    				padding: false,
    				$$slots: { default: [create_default_slot_18] },
    				$$scope: { ctx }
    			}
    		});

    	return {
    		c() {
    			create_component(cardcontent.$$.fragment);
    		},
    		m(target, anchor) {
    			mount_component(cardcontent, target, anchor);
    			current = true;
    		},
    		p(ctx, dirty) {
    			const cardcontent_changes = {};

    			if (dirty & /*$$scope*/ 1) {
    				cardcontent_changes.$$scope = { dirty, ctx };
    			}

    			cardcontent.$set(cardcontent_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(cardcontent.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(cardcontent.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			destroy_component(cardcontent, detaching);
    		}
    	};
    }

    // (119:14) <img slot="media" src="https://cdn.framework7.io/placeholder/fashion-88x88-4.jpg" width="44"/>
    function create_media_slot_2(ctx) {
    	let img;
    	let img_src_value;

    	return {
    		c() {
    			img = element("img");
    			attr(img, "slot", "media");
    			if (img.src !== (img_src_value = "https://cdn.framework7.io/placeholder/fashion-88x88-4.jpg")) attr(img, "src", img_src_value);
    			attr(img, "width", "44");
    		},
    		m(target, anchor) {
    			insert(target, img, anchor);
    		},
    		d(detaching) {
    			if (detaching) detach(img);
    		}
    	};
    }

    // (125:14) <img slot="media" src="https://cdn.framework7.io/placeholder/fashion-88x88-5.jpg" width="44"/>
    function create_media_slot_1(ctx) {
    	let img;
    	let img_src_value;

    	return {
    		c() {
    			img = element("img");
    			attr(img, "slot", "media");
    			if (img.src !== (img_src_value = "https://cdn.framework7.io/placeholder/fashion-88x88-5.jpg")) attr(img, "src", img_src_value);
    			attr(img, "width", "44");
    		},
    		m(target, anchor) {
    			insert(target, img, anchor);
    		},
    		d(detaching) {
    			if (detaching) detach(img);
    		}
    	};
    }

    // (131:14) <img slot="media" src="https://cdn.framework7.io/placeholder/fashion-88x88-6.jpg" width="44"/>
    function create_media_slot(ctx) {
    	let img;
    	let img_src_value;

    	return {
    		c() {
    			img = element("img");
    			attr(img, "slot", "media");
    			if (img.src !== (img_src_value = "https://cdn.framework7.io/placeholder/fashion-88x88-6.jpg")) attr(img, "src", img_src_value);
    			attr(img, "width", "44");
    		},
    		m(target, anchor) {
    			insert(target, img, anchor);
    		},
    		d(detaching) {
    			if (detaching) detach(img);
    		}
    	};
    }

    // (114:10) <List medial-list>
    function create_default_slot_13(ctx) {
    	let t0;
    	let t1;
    	let current;

    	const listitem0 = new List_item({
    			props: {
    				title: "Yellow Submarine",
    				subtitle: "Beatles",
    				$$slots: { media: [create_media_slot_2] },
    				$$scope: { ctx }
    			}
    		});

    	const listitem1 = new List_item({
    			props: {
    				title: "Don't Stop Me Now",
    				subtitle: "Queen",
    				$$slots: { media: [create_media_slot_1] },
    				$$scope: { ctx }
    			}
    		});

    	const listitem2 = new List_item({
    			props: {
    				title: "Billie Jean",
    				subtitle: "Michael Jackson",
    				$$slots: { media: [create_media_slot] },
    				$$scope: { ctx }
    			}
    		});

    	return {
    		c() {
    			create_component(listitem0.$$.fragment);
    			t0 = space();
    			create_component(listitem1.$$.fragment);
    			t1 = space();
    			create_component(listitem2.$$.fragment);
    		},
    		m(target, anchor) {
    			mount_component(listitem0, target, anchor);
    			insert(target, t0, anchor);
    			mount_component(listitem1, target, anchor);
    			insert(target, t1, anchor);
    			mount_component(listitem2, target, anchor);
    			current = true;
    		},
    		p(ctx, dirty) {
    			const listitem0_changes = {};

    			if (dirty & /*$$scope*/ 1) {
    				listitem0_changes.$$scope = { dirty, ctx };
    			}

    			listitem0.$set(listitem0_changes);
    			const listitem1_changes = {};

    			if (dirty & /*$$scope*/ 1) {
    				listitem1_changes.$$scope = { dirty, ctx };
    			}

    			listitem1.$set(listitem1_changes);
    			const listitem2_changes = {};

    			if (dirty & /*$$scope*/ 1) {
    				listitem2_changes.$$scope = { dirty, ctx };
    			}

    			listitem2.$set(listitem2_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(listitem0.$$.fragment, local);
    			transition_in(listitem1.$$.fragment, local);
    			transition_in(listitem2.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(listitem0.$$.fragment, local);
    			transition_out(listitem1.$$.fragment, local);
    			transition_out(listitem2.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			destroy_component(listitem0, detaching);
    			if (detaching) detach(t0);
    			destroy_component(listitem1, detaching);
    			if (detaching) detach(t1);
    			destroy_component(listitem2, detaching);
    		}
    	};
    }

    // (113:8) <CardContent padding={false}>
    function create_default_slot_12(ctx) {
    	let current;

    	const list = new List({
    			props: {
    				"medial-list": true,
    				$$slots: { default: [create_default_slot_13] },
    				$$scope: { ctx }
    			}
    		});

    	return {
    		c() {
    			create_component(list.$$.fragment);
    		},
    		m(target, anchor) {
    			mount_component(list, target, anchor);
    			current = true;
    		},
    		p(ctx, dirty) {
    			const list_changes = {};

    			if (dirty & /*$$scope*/ 1) {
    				list_changes.$$scope = { dirty, ctx };
    			}

    			list.$set(list_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(list.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(list.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			destroy_component(list, detaching);
    		}
    	};
    }

    // (135:8) <CardFooter>
    function create_default_slot_11$1(ctx) {
    	let span0;
    	let t1;
    	let span1;

    	return {
    		c() {
    			span0 = element("span");
    			span0.textContent = "January 20, 2015";
    			t1 = space();
    			span1 = element("span");
    			span1.textContent = "5 comments";
    		},
    		m(target, anchor) {
    			insert(target, span0, anchor);
    			insert(target, t1, anchor);
    			insert(target, span1, anchor);
    		},
    		d(detaching) {
    			if (detaching) detach(span0);
    			if (detaching) detach(t1);
    			if (detaching) detach(span1);
    		}
    	};
    }

    // (112:6) <Card title="New Releases:">
    function create_default_slot_10$1(ctx) {
    	let t;
    	let current;

    	const cardcontent = new Card_content({
    			props: {
    				padding: false,
    				$$slots: { default: [create_default_slot_12] },
    				$$scope: { ctx }
    			}
    		});

    	const cardfooter = new Card_footer({
    			props: {
    				$$slots: { default: [create_default_slot_11$1] },
    				$$scope: { ctx }
    			}
    		});

    	return {
    		c() {
    			create_component(cardcontent.$$.fragment);
    			t = space();
    			create_component(cardfooter.$$.fragment);
    		},
    		m(target, anchor) {
    			mount_component(cardcontent, target, anchor);
    			insert(target, t, anchor);
    			mount_component(cardfooter, target, anchor);
    			current = true;
    		},
    		p(ctx, dirty) {
    			const cardcontent_changes = {};

    			if (dirty & /*$$scope*/ 1) {
    				cardcontent_changes.$$scope = { dirty, ctx };
    			}

    			cardcontent.$set(cardcontent_changes);
    			const cardfooter_changes = {};

    			if (dirty & /*$$scope*/ 1) {
    				cardfooter_changes.$$scope = { dirty, ctx };
    			}

    			cardfooter.$set(cardfooter_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(cardcontent.$$.fragment, local);
    			transition_in(cardfooter.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(cardcontent.$$.fragment, local);
    			transition_out(cardfooter.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			destroy_component(cardcontent, detaching);
    			if (detaching) detach(t);
    			destroy_component(cardfooter, detaching);
    		}
    	};
    }

    // (141:6) <BlockTitle>
    function create_default_slot_9$1(ctx) {
    	let t;

    	return {
    		c() {
    			t = text("Expandable Cards");
    		},
    		m(target, anchor) {
    			insert(target, t, anchor);
    		},
    		d(detaching) {
    			if (detaching) detach(t);
    		}
    	};
    }

    // (145:12) <CardHeader textColor="white" class="display-block">
    function create_default_slot_8$1(ctx) {
    	let t0;
    	let br;
    	let t1;
    	let small;

    	return {
    		c() {
    			t0 = text("Framework7\n              ");
    			br = element("br");
    			t1 = space();
    			small = element("small");
    			small.textContent = "Build Mobile Apps";
    			set_style(small, "opacity", "0.7");
    		},
    		m(target, anchor) {
    			insert(target, t0, anchor);
    			insert(target, br, anchor);
    			insert(target, t1, anchor);
    			insert(target, small, anchor);
    		},
    		d(detaching) {
    			if (detaching) detach(t0);
    			if (detaching) detach(br);
    			if (detaching) detach(t1);
    			if (detaching) detach(small);
    		}
    	};
    }

    // (143:8) <CardContent padding={false}>
    function create_default_slot_7$1(ctx) {
    	let div0;
    	let t0;
    	let t1;
    	let div1;
    	let current;

    	const cardheader = new Card_header({
    			props: {
    				textColor: "white",
    				class: "display-block",
    				$$slots: { default: [create_default_slot_8$1] },
    				$$scope: { ctx }
    			}
    		});

    	const link = new Link({
    			props: {
    				cardClose: true,
    				color: "white",
    				class: "card-opened-fade-in",
    				style: "position: absolute; right: 15px; top: 15px",
    				iconF7: "xmark_circle_fill"
    			}
    		});

    	return {
    		c() {
    			div0 = element("div");
    			create_component(cardheader.$$.fragment);
    			t0 = space();
    			create_component(link.$$.fragment);
    			t1 = space();
    			div1 = element("div");

    			div1.innerHTML = `<p>Framework7 - is a free and open source HTML mobile framework to develop hybrid mobile apps or web apps with iOS or Android (Material) native look and feel. It is also an indispensable prototyping apps tool to show working app prototype as soon as possible in case you need to. Framework7 is created by Vladimir Kharlampidi (iDangero.us).</p> 
            <p>The main approach of the Framework7 is to give you an opportunity to create iOS and Android (Material) apps with HTML, CSS and JavaScript easily and clear. Framework7 is full of freedom. It doesn&#39;t limit your imagination or offer ways of any solutions somehow. Framework7 gives you freedom!</p> 
            <p>Framework7 is not compatible with all platforms. It is focused only on iOS and Android (Material) to bring the best experience and simplicity.</p> 
            <p>Framework7 is definitely for you if you decide to build iOS and Android hybrid app (Cordova or PhoneGap) or web app that looks like and feels as great native iOS or Android (Material) apps.</p>`;

    			attr(div0, "class", "bg-color-red");
    			set_style(div0, "height", "300px");
    			attr(div1, "class", "card-content-padding");
    		},
    		m(target, anchor) {
    			insert(target, div0, anchor);
    			mount_component(cardheader, div0, null);
    			append(div0, t0);
    			mount_component(link, div0, null);
    			insert(target, t1, anchor);
    			insert(target, div1, anchor);
    			current = true;
    		},
    		p(ctx, dirty) {
    			const cardheader_changes = {};

    			if (dirty & /*$$scope*/ 1) {
    				cardheader_changes.$$scope = { dirty, ctx };
    			}

    			cardheader.$set(cardheader_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(cardheader.$$.fragment, local);
    			transition_in(link.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(cardheader.$$.fragment, local);
    			transition_out(link.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(div0);
    			destroy_component(cardheader);
    			destroy_component(link);
    			if (detaching) detach(t1);
    			if (detaching) detach(div1);
    		}
    	};
    }

    // (142:6) <Card expandable>
    function create_default_slot_6$1(ctx) {
    	let current;

    	const cardcontent = new Card_content({
    			props: {
    				padding: false,
    				$$slots: { default: [create_default_slot_7$1] },
    				$$scope: { ctx }
    			}
    		});

    	return {
    		c() {
    			create_component(cardcontent.$$.fragment);
    		},
    		m(target, anchor) {
    			mount_component(cardcontent, target, anchor);
    			current = true;
    		},
    		p(ctx, dirty) {
    			const cardcontent_changes = {};

    			if (dirty & /*$$scope*/ 1) {
    				cardcontent_changes.$$scope = { dirty, ctx };
    			}

    			cardcontent.$set(cardcontent_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(cardcontent.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(cardcontent.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			destroy_component(cardcontent, detaching);
    		}
    	};
    }

    // (164:12) <CardHeader textColor="black" class="display-block">
    function create_default_slot_5$1(ctx) {
    	let t0;
    	let br;
    	let t1;
    	let small;

    	return {
    		c() {
    			t0 = text("Framework7\n              ");
    			br = element("br");
    			t1 = space();
    			small = element("small");
    			small.textContent = "Build Mobile Apps";
    			set_style(small, "opacity", "0.7");
    		},
    		m(target, anchor) {
    			insert(target, t0, anchor);
    			insert(target, br, anchor);
    			insert(target, t1, anchor);
    			insert(target, small, anchor);
    		},
    		d(detaching) {
    			if (detaching) detach(t0);
    			if (detaching) detach(br);
    			if (detaching) detach(t1);
    			if (detaching) detach(small);
    		}
    	};
    }

    // (162:8) <CardContent padding={false}>
    function create_default_slot_4$1(ctx) {
    	let div0;
    	let t0;
    	let t1;
    	let div1;
    	let current;

    	const cardheader = new Card_header({
    			props: {
    				textColor: "black",
    				class: "display-block",
    				$$slots: { default: [create_default_slot_5$1] },
    				$$scope: { ctx }
    			}
    		});

    	const link = new Link({
    			props: {
    				cardClose: true,
    				color: "black",
    				class: "card-opened-fade-in",
    				style: "position: absolute; right: 15px; top: 15px",
    				iconF7: "xmark_circle_fill"
    			}
    		});

    	return {
    		c() {
    			div0 = element("div");
    			create_component(cardheader.$$.fragment);
    			t0 = space();
    			create_component(link.$$.fragment);
    			t1 = space();
    			div1 = element("div");

    			div1.innerHTML = `<p>Framework7 - is a free and open source HTML mobile framework to develop hybrid mobile apps or web apps with iOS or Android (Material) native look and feel. It is also an indispensable prototyping apps tool to show working app prototype as soon as possible in case you need to. Framework7 is created by Vladimir Kharlampidi (iDangero.us).</p> 
            <p>The main approach of the Framework7 is to give you an opportunity to create iOS and Android (Material) apps with HTML, CSS and JavaScript easily and clear. Framework7 is full of freedom. It doesn&#39;t limit your imagination or offer ways of any solutions somehow. Framework7 gives you freedom!</p> 
            <p>Framework7 is not compatible with all platforms. It is focused only on iOS and Android (Material) to bring the best experience and simplicity.</p> 
            <p>Framework7 is definitely for you if you decide to build iOS and Android hybrid app (Cordova or PhoneGap) or web app that looks like and feels as great native iOS or Android (Material) apps.</p>`;

    			attr(div0, "class", "bg-color-yellow");
    			set_style(div0, "height", "300px");
    			attr(div1, "class", "card-content-padding");
    		},
    		m(target, anchor) {
    			insert(target, div0, anchor);
    			mount_component(cardheader, div0, null);
    			append(div0, t0);
    			mount_component(link, div0, null);
    			insert(target, t1, anchor);
    			insert(target, div1, anchor);
    			current = true;
    		},
    		p(ctx, dirty) {
    			const cardheader_changes = {};

    			if (dirty & /*$$scope*/ 1) {
    				cardheader_changes.$$scope = { dirty, ctx };
    			}

    			cardheader.$set(cardheader_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(cardheader.$$.fragment, local);
    			transition_in(link.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(cardheader.$$.fragment, local);
    			transition_out(link.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(div0);
    			destroy_component(cardheader);
    			destroy_component(link);
    			if (detaching) detach(t1);
    			if (detaching) detach(div1);
    		}
    	};
    }

    // (161:6) <Card expandable>
    function create_default_slot_3$1(ctx) {
    	let current;

    	const cardcontent = new Card_content({
    			props: {
    				padding: false,
    				$$slots: { default: [create_default_slot_4$1] },
    				$$scope: { ctx }
    			}
    		});

    	return {
    		c() {
    			create_component(cardcontent.$$.fragment);
    		},
    		m(target, anchor) {
    			mount_component(cardcontent, target, anchor);
    			current = true;
    		},
    		p(ctx, dirty) {
    			const cardcontent_changes = {};

    			if (dirty & /*$$scope*/ 1) {
    				cardcontent_changes.$$scope = { dirty, ctx };
    			}

    			cardcontent.$set(cardcontent_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(cardcontent.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(cardcontent.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			destroy_component(cardcontent, detaching);
    		}
    	};
    }

    // (4:4) <Page>
    function create_default_slot_2$4(ctx) {
    	let t0;
    	let t1;
    	let t2;
    	let t3;
    	let t4;
    	let t5;
    	let t6;
    	let t7;
    	let t8;
    	let t9;
    	let t10;
    	let t11;
    	let t12;
    	let t13;
    	let t14;
    	let t15;
    	let t16;
    	let t17;
    	let t18;
    	let t19;
    	let current;
    	const navbar = new Navbar({ props: { title: "Cards" } });

    	const blocktitle0 = new Block_title({
    			props: {
    				$$slots: { default: [create_default_slot_55] },
    				$$scope: { ctx }
    			}
    		});

    	const card0 = new Card({
    			props: {
    				content: "This is a simple card with plain text, but cards can also contain their own header, footer, list view, image, or any other element."
    			}
    		});

    	const card1 = new Card({
    			props: {
    				title: "Card header",
    				content: "Card with header and footer. Card headers are used to display card titles and footers for additional information or just for custom actions.",
    				footer: "Card footer"
    			}
    		});

    	const card2 = new Card({
    			props: {
    				content: "Another card. Lorem ipsum dolor sit amet, consectetur adipiscing elit. Suspendisse feugiat sem est, non tincidunt ligula volutpat sit amet. Mauris aliquet magna justo. "
    			}
    		});

    	const blocktitle1 = new Block_title({
    			props: {
    				$$slots: { default: [create_default_slot_54] },
    				$$scope: { ctx }
    			}
    		});

    	const card3 = new Card({
    			props: {
    				outline: true,
    				content: "This is a simple card with plain text, but cards can also contain their own header, footer, list view, image, or any other element."
    			}
    		});

    	const card4 = new Card({
    			props: {
    				outline: true,
    				title: "Card header",
    				content: "Card with header and footer. Card headers are used to display card titles and footers for additional information or just for custom actions.",
    				footer: "Card footer"
    			}
    		});

    	const card5 = new Card({
    			props: {
    				outline: true,
    				content: "Another card. Lorem ipsum dolor sit amet, consectetur adipiscing elit. Suspendisse feugiat sem est, non tincidunt ligula volutpat sit amet. Mauris aliquet magna justo. "
    			}
    		});

    	const blocktitle2 = new Block_title({
    			props: {
    				$$slots: { default: [create_default_slot_53] },
    				$$scope: { ctx }
    			}
    		});

    	const card6 = new Card({
    			props: {
    				class: "demo-card-header-pic",
    				$$slots: { default: [create_default_slot_47] },
    				$$scope: { ctx }
    			}
    		});

    	const card7 = new Card({
    			props: {
    				class: "demo-card-header-pic",
    				$$slots: { default: [create_default_slot_41] },
    				$$scope: { ctx }
    			}
    		});

    	const blocktitle3 = new Block_title({
    			props: {
    				$$slots: { default: [create_default_slot_40] },
    				$$scope: { ctx }
    			}
    		});

    	const card8 = new Card({
    			props: {
    				class: "demo-facebook-card",
    				$$slots: { default: [create_default_slot_33] },
    				$$scope: { ctx }
    			}
    		});

    	const card9 = new Card({
    			props: {
    				class: "demo-facebook-card",
    				$$slots: { default: [create_default_slot_26] },
    				$$scope: { ctx }
    			}
    		});

    	const blocktitle4 = new Block_title({
    			props: {
    				$$slots: { default: [create_default_slot_25] },
    				$$scope: { ctx }
    			}
    		});

    	const card10 = new Card({
    			props: {
    				$$slots: { default: [create_default_slot_17] },
    				$$scope: { ctx }
    			}
    		});

    	const card11 = new Card({
    			props: {
    				title: "New Releases:",
    				$$slots: { default: [create_default_slot_10$1] },
    				$$scope: { ctx }
    			}
    		});

    	const blocktitle5 = new Block_title({
    			props: {
    				$$slots: { default: [create_default_slot_9$1] },
    				$$scope: { ctx }
    			}
    		});

    	const card12 = new Card({
    			props: {
    				expandable: true,
    				$$slots: { default: [create_default_slot_6$1] },
    				$$scope: { ctx }
    			}
    		});

    	const card13 = new Card({
    			props: {
    				expandable: true,
    				$$slots: { default: [create_default_slot_3$1] },
    				$$scope: { ctx }
    			}
    		});

    	return {
    		c() {
    			create_component(navbar.$$.fragment);
    			t0 = space();
    			create_component(blocktitle0.$$.fragment);
    			t1 = space();
    			create_component(card0.$$.fragment);
    			t2 = space();
    			create_component(card1.$$.fragment);
    			t3 = space();
    			create_component(card2.$$.fragment);
    			t4 = space();
    			create_component(blocktitle1.$$.fragment);
    			t5 = space();
    			create_component(card3.$$.fragment);
    			t6 = space();
    			create_component(card4.$$.fragment);
    			t7 = space();
    			create_component(card5.$$.fragment);
    			t8 = space();
    			create_component(blocktitle2.$$.fragment);
    			t9 = space();
    			create_component(card6.$$.fragment);
    			t10 = space();
    			create_component(card7.$$.fragment);
    			t11 = space();
    			create_component(blocktitle3.$$.fragment);
    			t12 = space();
    			create_component(card8.$$.fragment);
    			t13 = space();
    			create_component(card9.$$.fragment);
    			t14 = space();
    			create_component(blocktitle4.$$.fragment);
    			t15 = space();
    			create_component(card10.$$.fragment);
    			t16 = space();
    			create_component(card11.$$.fragment);
    			t17 = space();
    			create_component(blocktitle5.$$.fragment);
    			t18 = space();
    			create_component(card12.$$.fragment);
    			t19 = space();
    			create_component(card13.$$.fragment);
    		},
    		m(target, anchor) {
    			mount_component(navbar, target, anchor);
    			insert(target, t0, anchor);
    			mount_component(blocktitle0, target, anchor);
    			insert(target, t1, anchor);
    			mount_component(card0, target, anchor);
    			insert(target, t2, anchor);
    			mount_component(card1, target, anchor);
    			insert(target, t3, anchor);
    			mount_component(card2, target, anchor);
    			insert(target, t4, anchor);
    			mount_component(blocktitle1, target, anchor);
    			insert(target, t5, anchor);
    			mount_component(card3, target, anchor);
    			insert(target, t6, anchor);
    			mount_component(card4, target, anchor);
    			insert(target, t7, anchor);
    			mount_component(card5, target, anchor);
    			insert(target, t8, anchor);
    			mount_component(blocktitle2, target, anchor);
    			insert(target, t9, anchor);
    			mount_component(card6, target, anchor);
    			insert(target, t10, anchor);
    			mount_component(card7, target, anchor);
    			insert(target, t11, anchor);
    			mount_component(blocktitle3, target, anchor);
    			insert(target, t12, anchor);
    			mount_component(card8, target, anchor);
    			insert(target, t13, anchor);
    			mount_component(card9, target, anchor);
    			insert(target, t14, anchor);
    			mount_component(blocktitle4, target, anchor);
    			insert(target, t15, anchor);
    			mount_component(card10, target, anchor);
    			insert(target, t16, anchor);
    			mount_component(card11, target, anchor);
    			insert(target, t17, anchor);
    			mount_component(blocktitle5, target, anchor);
    			insert(target, t18, anchor);
    			mount_component(card12, target, anchor);
    			insert(target, t19, anchor);
    			mount_component(card13, target, anchor);
    			current = true;
    		},
    		p(ctx, dirty) {
    			const blocktitle0_changes = {};

    			if (dirty & /*$$scope*/ 1) {
    				blocktitle0_changes.$$scope = { dirty, ctx };
    			}

    			blocktitle0.$set(blocktitle0_changes);
    			const blocktitle1_changes = {};

    			if (dirty & /*$$scope*/ 1) {
    				blocktitle1_changes.$$scope = { dirty, ctx };
    			}

    			blocktitle1.$set(blocktitle1_changes);
    			const blocktitle2_changes = {};

    			if (dirty & /*$$scope*/ 1) {
    				blocktitle2_changes.$$scope = { dirty, ctx };
    			}

    			blocktitle2.$set(blocktitle2_changes);
    			const card6_changes = {};

    			if (dirty & /*$$scope*/ 1) {
    				card6_changes.$$scope = { dirty, ctx };
    			}

    			card6.$set(card6_changes);
    			const card7_changes = {};

    			if (dirty & /*$$scope*/ 1) {
    				card7_changes.$$scope = { dirty, ctx };
    			}

    			card7.$set(card7_changes);
    			const blocktitle3_changes = {};

    			if (dirty & /*$$scope*/ 1) {
    				blocktitle3_changes.$$scope = { dirty, ctx };
    			}

    			blocktitle3.$set(blocktitle3_changes);
    			const card8_changes = {};

    			if (dirty & /*$$scope*/ 1) {
    				card8_changes.$$scope = { dirty, ctx };
    			}

    			card8.$set(card8_changes);
    			const card9_changes = {};

    			if (dirty & /*$$scope*/ 1) {
    				card9_changes.$$scope = { dirty, ctx };
    			}

    			card9.$set(card9_changes);
    			const blocktitle4_changes = {};

    			if (dirty & /*$$scope*/ 1) {
    				blocktitle4_changes.$$scope = { dirty, ctx };
    			}

    			blocktitle4.$set(blocktitle4_changes);
    			const card10_changes = {};

    			if (dirty & /*$$scope*/ 1) {
    				card10_changes.$$scope = { dirty, ctx };
    			}

    			card10.$set(card10_changes);
    			const card11_changes = {};

    			if (dirty & /*$$scope*/ 1) {
    				card11_changes.$$scope = { dirty, ctx };
    			}

    			card11.$set(card11_changes);
    			const blocktitle5_changes = {};

    			if (dirty & /*$$scope*/ 1) {
    				blocktitle5_changes.$$scope = { dirty, ctx };
    			}

    			blocktitle5.$set(blocktitle5_changes);
    			const card12_changes = {};

    			if (dirty & /*$$scope*/ 1) {
    				card12_changes.$$scope = { dirty, ctx };
    			}

    			card12.$set(card12_changes);
    			const card13_changes = {};

    			if (dirty & /*$$scope*/ 1) {
    				card13_changes.$$scope = { dirty, ctx };
    			}

    			card13.$set(card13_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(navbar.$$.fragment, local);
    			transition_in(blocktitle0.$$.fragment, local);
    			transition_in(card0.$$.fragment, local);
    			transition_in(card1.$$.fragment, local);
    			transition_in(card2.$$.fragment, local);
    			transition_in(blocktitle1.$$.fragment, local);
    			transition_in(card3.$$.fragment, local);
    			transition_in(card4.$$.fragment, local);
    			transition_in(card5.$$.fragment, local);
    			transition_in(blocktitle2.$$.fragment, local);
    			transition_in(card6.$$.fragment, local);
    			transition_in(card7.$$.fragment, local);
    			transition_in(blocktitle3.$$.fragment, local);
    			transition_in(card8.$$.fragment, local);
    			transition_in(card9.$$.fragment, local);
    			transition_in(blocktitle4.$$.fragment, local);
    			transition_in(card10.$$.fragment, local);
    			transition_in(card11.$$.fragment, local);
    			transition_in(blocktitle5.$$.fragment, local);
    			transition_in(card12.$$.fragment, local);
    			transition_in(card13.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(navbar.$$.fragment, local);
    			transition_out(blocktitle0.$$.fragment, local);
    			transition_out(card0.$$.fragment, local);
    			transition_out(card1.$$.fragment, local);
    			transition_out(card2.$$.fragment, local);
    			transition_out(blocktitle1.$$.fragment, local);
    			transition_out(card3.$$.fragment, local);
    			transition_out(card4.$$.fragment, local);
    			transition_out(card5.$$.fragment, local);
    			transition_out(blocktitle2.$$.fragment, local);
    			transition_out(card6.$$.fragment, local);
    			transition_out(card7.$$.fragment, local);
    			transition_out(blocktitle3.$$.fragment, local);
    			transition_out(card8.$$.fragment, local);
    			transition_out(card9.$$.fragment, local);
    			transition_out(blocktitle4.$$.fragment, local);
    			transition_out(card10.$$.fragment, local);
    			transition_out(card11.$$.fragment, local);
    			transition_out(blocktitle5.$$.fragment, local);
    			transition_out(card12.$$.fragment, local);
    			transition_out(card13.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			destroy_component(navbar, detaching);
    			if (detaching) detach(t0);
    			destroy_component(blocktitle0, detaching);
    			if (detaching) detach(t1);
    			destroy_component(card0, detaching);
    			if (detaching) detach(t2);
    			destroy_component(card1, detaching);
    			if (detaching) detach(t3);
    			destroy_component(card2, detaching);
    			if (detaching) detach(t4);
    			destroy_component(blocktitle1, detaching);
    			if (detaching) detach(t5);
    			destroy_component(card3, detaching);
    			if (detaching) detach(t6);
    			destroy_component(card4, detaching);
    			if (detaching) detach(t7);
    			destroy_component(card5, detaching);
    			if (detaching) detach(t8);
    			destroy_component(blocktitle2, detaching);
    			if (detaching) detach(t9);
    			destroy_component(card6, detaching);
    			if (detaching) detach(t10);
    			destroy_component(card7, detaching);
    			if (detaching) detach(t11);
    			destroy_component(blocktitle3, detaching);
    			if (detaching) detach(t12);
    			destroy_component(card8, detaching);
    			if (detaching) detach(t13);
    			destroy_component(card9, detaching);
    			if (detaching) detach(t14);
    			destroy_component(blocktitle4, detaching);
    			if (detaching) detach(t15);
    			destroy_component(card10, detaching);
    			if (detaching) detach(t16);
    			destroy_component(card11, detaching);
    			if (detaching) detach(t17);
    			destroy_component(blocktitle5, detaching);
    			if (detaching) detach(t18);
    			destroy_component(card12, detaching);
    			if (detaching) detach(t19);
    			destroy_component(card13, detaching);
    		}
    	};
    }

    // (3:2) <View main>
    function create_default_slot_1$4(ctx) {
    	let current;

    	const page = new Page({
    			props: {
    				$$slots: { default: [create_default_slot_2$4] },
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

    			if (dirty & /*$$scope*/ 1) {
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

    // (2:0) <App>
    function create_default_slot$5(ctx) {
    	let current;

    	const view = new View({
    			props: {
    				main: true,
    				$$slots: { default: [create_default_slot_1$4] },
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

    			if (dirty & /*$$scope*/ 1) {
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

    function create_fragment$k(ctx) {
    	let current;

    	const app = new App({
    			props: {
    				$$slots: { default: [create_default_slot$5] },
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

    			if (dirty & /*$$scope*/ 1) {
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

    class Cards extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, null, create_fragment$k, safe_not_equal, {});
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
    const app = new Cards({
      target: document.getElementById('app'),
    });

    return app;

})));
