(function (global, factory) {
    typeof exports === 'object' && typeof module !== 'undefined' ? module.exports = factory(require('framework7')) :
    typeof define === 'function' && define.amd ? define(['framework7'], factory) :
    (global = global || self, global.menu = factory(global.Framework7));
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

    /* public/packages/svelte/components/link.svelte generated by Svelte v3.22.3 */

    function create_if_block_2(ctx) {
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
    function create_if_block_3(ctx) {
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
    function create_if_block(ctx) {
    	let span;
    	let t0_value = Utils.text(/*text*/ ctx[0]) + "";
    	let t0;
    	let t1;
    	let current;
    	let if_block = typeof /*badge*/ ctx[1] !== "undefined" && create_if_block_1(ctx);

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
    					if_block = create_if_block_1(ctx);
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
    function create_if_block_1(ctx) {
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

    function create_fragment$5(ctx) {
    	let a;
    	let t0;
    	let t1;
    	let current;
    	let dispose;
    	let if_block0 = /*hasIcon*/ ctx[8] && create_if_block_2(ctx);
    	const default_slot_template = /*$$slots*/ ctx[33].default;
    	const default_slot = create_slot(default_slot_template, ctx, /*$$scope*/ ctx[35], null);
    	let if_block1 = (typeof /*text*/ ctx[0] !== "undefined" || typeof /*badge*/ ctx[1] !== "undefined") && create_if_block(ctx);
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
    					if_block0 = create_if_block_2(ctx);
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
    					if_block1 = create_if_block(ctx);
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
    			create_fragment$5,
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

    /* public/packages/svelte/components/menu-dropdown-item.svelte generated by Svelte v3.22.3 */

    function create_else_block(ctx) {
    	let div;
    	let t0_value = Utils.text(/*text*/ ctx[0]) + "";
    	let t0;
    	let t1;
    	let current;
    	let dispose;
    	const default_slot_template = /*$$slots*/ ctx[16].default;
    	const default_slot = create_slot(default_slot_template, ctx, /*$$scope*/ ctx[15], null);
    	let div_levels = [{ class: /*classes*/ ctx[4] }, /*attrs*/ ctx[2]];
    	let div_data = {};

    	for (let i = 0; i < div_levels.length; i += 1) {
    		div_data = assign(div_data, div_levels[i]);
    	}

    	return {
    		c() {
    			div = element("div");
    			t0 = text(t0_value);
    			t1 = space();
    			if (default_slot) default_slot.c();
    			set_attributes(div, div_data);
    		},
    		m(target, anchor, remount) {
    			insert(target, div, anchor);
    			append(div, t0);
    			append(div, t1);

    			if (default_slot) {
    				default_slot.m(div, null);
    			}

    			/*div_binding*/ ctx[18](div);
    			current = true;
    			if (remount) dispose();
    			dispose = listen(div, "click", /*onClick*/ ctx[5]);
    		},
    		p(ctx, dirty) {
    			if ((!current || dirty & /*text*/ 1) && t0_value !== (t0_value = Utils.text(/*text*/ ctx[0]) + "")) set_data(t0, t0_value);

    			if (default_slot) {
    				if (default_slot.p && dirty & /*$$scope*/ 32768) {
    					default_slot.p(get_slot_context(default_slot_template, ctx, /*$$scope*/ ctx[15], null), get_slot_changes(default_slot_template, /*$$scope*/ ctx[15], dirty, null));
    				}
    			}

    			set_attributes(div, get_spread_update(div_levels, [
    				dirty & /*classes*/ 16 && { class: /*classes*/ ctx[4] },
    				dirty & /*attrs*/ 4 && /*attrs*/ ctx[2]
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
    			/*div_binding*/ ctx[18](null);
    			dispose();
    		}
    	};
    }

    // (72:0) {#if isLink}
    function create_if_block$1(ctx) {
    	let a;
    	let t0_value = Utils.text(/*text*/ ctx[0]) + "";
    	let t0;
    	let t1;
    	let current;
    	let dispose;
    	const default_slot_template = /*$$slots*/ ctx[16].default;
    	const default_slot = create_slot(default_slot_template, ctx, /*$$scope*/ ctx[15], null);
    	let a_levels = [{ class: /*classes*/ ctx[4] }, /*attrs*/ ctx[2]];
    	let a_data = {};

    	for (let i = 0; i < a_levels.length; i += 1) {
    		a_data = assign(a_data, a_levels[i]);
    	}

    	return {
    		c() {
    			a = element("a");
    			t0 = text(t0_value);
    			t1 = space();
    			if (default_slot) default_slot.c();
    			set_attributes(a, a_data);
    		},
    		m(target, anchor, remount) {
    			insert(target, a, anchor);
    			append(a, t0);
    			append(a, t1);

    			if (default_slot) {
    				default_slot.m(a, null);
    			}

    			/*a_binding*/ ctx[17](a);
    			current = true;
    			if (remount) dispose();
    			dispose = listen(a, "click", /*onClick*/ ctx[5]);
    		},
    		p(ctx, dirty) {
    			if ((!current || dirty & /*text*/ 1) && t0_value !== (t0_value = Utils.text(/*text*/ ctx[0]) + "")) set_data(t0, t0_value);

    			if (default_slot) {
    				if (default_slot.p && dirty & /*$$scope*/ 32768) {
    					default_slot.p(get_slot_context(default_slot_template, ctx, /*$$scope*/ ctx[15], null), get_slot_changes(default_slot_template, /*$$scope*/ ctx[15], dirty, null));
    				}
    			}

    			set_attributes(a, get_spread_update(a_levels, [
    				dirty & /*classes*/ 16 && { class: /*classes*/ ctx[4] },
    				dirty & /*attrs*/ 4 && /*attrs*/ ctx[2]
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
    			if (detaching) detach(a);
    			if (default_slot) default_slot.d(detaching);
    			/*a_binding*/ ctx[17](null);
    			dispose();
    		}
    	};
    }

    function create_fragment$6(ctx) {
    	let current_block_type_index;
    	let if_block;
    	let if_block_anchor;
    	let current;
    	const if_block_creators = [create_if_block$1, create_else_block];
    	const if_blocks = [];

    	function select_block_type(ctx, dirty) {
    		if (/*isLink*/ ctx[3]) return 0;
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
    		p(ctx, [dirty]) {
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

    function instance$6($$self, $$props, $$invalidate) {
    	const omit_props_names = ["class","text","href","link","target","divider"];
    	let $$restProps = compute_rest_props($$props, omit_props_names);
    	const dispatch = createEventDispatcher();
    	let { class: className = undefined } = $$props;
    	let { text = undefined } = $$props;
    	let { href = undefined } = $$props;
    	let { link = undefined } = $$props;
    	let { target = undefined } = $$props;
    	let { divider = undefined } = $$props;
    	let el;

    	function onClick(e) {
    		dispatch("click", [e]);
    		if (typeof $$props.onClick === "function") $$props.onClick(e);
    	}

    	onMount(() => {
    		if ($$props.routeProps) {
    			$$invalidate(1, el.f7RouteProps = $$props.routeProps, el);
    		}
    	});

    	afterUpdate(() => {
    		if ($$props.routeProps && el) {
    			$$invalidate(1, el.f7RouteProps = $$props.routeProps, el);
    		}
    	});

    	onDestroy(() => {
    		if (!el || !f7.instance) return;
    		delete el.f7RouteProps;
    	});

    	let { $$slots = {}, $$scope } = $$props;

    	function a_binding($$value) {
    		binding_callbacks[$$value ? "unshift" : "push"](() => {
    			$$invalidate(1, el = $$value);
    		});
    	}

    	function div_binding($$value) {
    		binding_callbacks[$$value ? "unshift" : "push"](() => {
    			$$invalidate(1, el = $$value);
    		});
    	}

    	$$self.$set = $$new_props => {
    		$$invalidate(14, $$props = assign(assign({}, $$props), exclude_internal_props($$new_props)));
    		$$invalidate(13, $$restProps = compute_rest_props($$props, omit_props_names));
    		if ("class" in $$new_props) $$invalidate(6, className = $$new_props.class);
    		if ("text" in $$new_props) $$invalidate(0, text = $$new_props.text);
    		if ("href" in $$new_props) $$invalidate(7, href = $$new_props.href);
    		if ("link" in $$new_props) $$invalidate(8, link = $$new_props.link);
    		if ("target" in $$new_props) $$invalidate(9, target = $$new_props.target);
    		if ("divider" in $$new_props) $$invalidate(10, divider = $$new_props.divider);
    		if ("$$scope" in $$new_props) $$invalidate(15, $$scope = $$new_props.$$scope);
    	};

    	let hrefComputed;
    	let attrs;
    	let isLink;
    	let classes;

    	$$self.$$.update = () => {
    		if ($$self.$$.dirty & /*href, link*/ 384) {
    			 $$invalidate(11, hrefComputed = typeof href === "undefined" && link ? "#" : href);
    		}

    		 $$invalidate(2, attrs = Utils.extend(
    			{
    				href: hrefComputed,
    				target,
    				...restProps($$restProps)
    			},
    			Mixins.linkRouterAttrs($$props),
    			Mixins.linkActionsAttrs($$props)
    		));

    		if ($$self.$$.dirty & /*link, href*/ 384) {
    			 $$invalidate(3, isLink = link || href || href === "");
    		}

    		 $$invalidate(4, classes = Utils.classNames(
    			{
    				"menu-dropdown-link": isLink && !divider,
    				"menu-dropdown-item": !isLink && !divider,
    				"menu-dropdown-divider": divider
    			},
    			className,
    			Mixins.colorClasses($$props),
    			Mixins.linkRouterClasses($$props),
    			Mixins.linkActionsClasses($$props),
    			{
    				"menu-close": typeof menuClose === "undefined"
    			}
    		));
    	};

    	$$props = exclude_internal_props($$props);

    	return [
    		text,
    		el,
    		attrs,
    		isLink,
    		classes,
    		onClick,
    		className,
    		href,
    		link,
    		target,
    		divider,
    		hrefComputed,
    		dispatch,
    		$$restProps,
    		$$props,
    		$$scope,
    		$$slots,
    		a_binding,
    		div_binding
    	];
    }

    class Menu_dropdown_item extends SvelteComponent {
    	constructor(options) {
    		super();

    		init(this, options, instance$6, create_fragment$6, safe_not_equal, {
    			class: 6,
    			text: 0,
    			href: 7,
    			link: 8,
    			target: 9,
    			divider: 10
    		});
    	}
    }

    /* public/packages/svelte/components/menu-dropdown.svelte generated by Svelte v3.22.3 */

    function create_fragment$7(ctx) {
    	let div1;
    	let div0;
    	let div0_style_value;
    	let current;
    	const default_slot_template = /*$$slots*/ ctx[11].default;
    	const default_slot = create_slot(default_slot_template, ctx, /*$$scope*/ ctx[10], null);
    	let div1_levels = [{ class: /*classes*/ ctx[1] }, restProps(/*$$restProps*/ ctx[2])];
    	let div1_data = {};

    	for (let i = 0; i < div1_levels.length; i += 1) {
    		div1_data = assign(div1_data, div1_levels[i]);
    	}

    	return {
    		c() {
    			div1 = element("div");
    			div0 = element("div");
    			if (default_slot) default_slot.c();
    			attr(div0, "class", "menu-dropdown-content");
    			attr(div0, "style", div0_style_value = /*contentHeight*/ ctx[0] && `height: ${/*contentHeight*/ ctx[0]}`);
    			set_attributes(div1, div1_data);
    		},
    		m(target, anchor) {
    			insert(target, div1, anchor);
    			append(div1, div0);

    			if (default_slot) {
    				default_slot.m(div0, null);
    			}

    			current = true;
    		},
    		p(ctx, [dirty]) {
    			if (default_slot) {
    				if (default_slot.p && dirty & /*$$scope*/ 1024) {
    					default_slot.p(get_slot_context(default_slot_template, ctx, /*$$scope*/ ctx[10], null), get_slot_changes(default_slot_template, /*$$scope*/ ctx[10], dirty, null));
    				}
    			}

    			if (!current || dirty & /*contentHeight*/ 1 && div0_style_value !== (div0_style_value = /*contentHeight*/ ctx[0] && `height: ${/*contentHeight*/ ctx[0]}`)) {
    				attr(div0, "style", div0_style_value);
    			}

    			set_attributes(div1, get_spread_update(div1_levels, [
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
    			if (detaching) detach(div1);
    			if (default_slot) default_slot.d(detaching);
    		}
    	};
    }

    function instance$7($$self, $$props, $$invalidate) {
    	const omit_props_names = ["class","contentHeight","position","left","center","right"];
    	let $$restProps = compute_rest_props($$props, omit_props_names);
    	let { class: className = undefined } = $$props;
    	let { contentHeight = undefined } = $$props;
    	let { position = undefined } = $$props;
    	let { left = undefined } = $$props;
    	let { center = undefined } = $$props;
    	let { right = undefined } = $$props;
    	let { $$slots = {}, $$scope } = $$props;

    	$$self.$set = $$new_props => {
    		$$invalidate(9, $$props = assign(assign({}, $$props), exclude_internal_props($$new_props)));
    		$$invalidate(2, $$restProps = compute_rest_props($$props, omit_props_names));
    		if ("class" in $$new_props) $$invalidate(3, className = $$new_props.class);
    		if ("contentHeight" in $$new_props) $$invalidate(0, contentHeight = $$new_props.contentHeight);
    		if ("position" in $$new_props) $$invalidate(4, position = $$new_props.position);
    		if ("left" in $$new_props) $$invalidate(5, left = $$new_props.left);
    		if ("center" in $$new_props) $$invalidate(6, center = $$new_props.center);
    		if ("right" in $$new_props) $$invalidate(7, right = $$new_props.right);
    		if ("$$scope" in $$new_props) $$invalidate(10, $$scope = $$new_props.$$scope);
    	};

    	let positionComputed;
    	let classes;

    	$$self.$$.update = () => {
    		if ($$self.$$.dirty & /*position, left, center, right*/ 240) {
    			 $$invalidate(8, positionComputed = (() => {
    				let pos = position || "left";
    				if (left) pos = "left";
    				if (center) pos = "center";
    				if (right) pos = "right";
    				return pos;
    			})());
    		}

    		 $$invalidate(1, classes = Utils.classNames("menu-dropdown", `menu-dropdown-${positionComputed}`, Mixins.colorClasses($$props), className));
    	};

    	$$props = exclude_internal_props($$props);

    	return [
    		contentHeight,
    		classes,
    		$$restProps,
    		className,
    		position,
    		left,
    		center,
    		right,
    		positionComputed,
    		$$props,
    		$$scope,
    		$$slots
    	];
    }

    class Menu_dropdown extends SvelteComponent {
    	constructor(options) {
    		super();

    		init(this, options, instance$7, create_fragment$7, safe_not_equal, {
    			class: 3,
    			contentHeight: 0,
    			position: 4,
    			left: 5,
    			center: 6,
    			right: 7
    		});
    	}
    }

    /* public/packages/svelte/components/menu-item.svelte generated by Svelte v3.22.3 */
    const get_text_slot_changes_1 = dirty => ({});
    const get_text_slot_context_1 = ctx => ({});
    const get_text_slot_changes = dirty => ({});
    const get_text_slot_context = ctx => ({});

    // (121:0) {:else}
    function create_else_block$1(ctx) {
    	let div;
    	let t;
    	let current;
    	let dispose;
    	let if_block = (typeof /*text*/ ctx[0] !== "undefined" || /*hasTextSlots*/ ctx[3] || /*hasIcon*/ ctx[5]) && create_if_block_3$1(ctx);
    	const default_slot_template = /*$$slots*/ ctx[23].default;
    	const default_slot = create_slot(default_slot_template, ctx, /*$$scope*/ ctx[22], null);
    	let div_levels = [{ class: /*classes*/ ctx[4] }, /*attrs*/ ctx[2]];
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
    		m(target, anchor, remount) {
    			insert(target, div, anchor);
    			if (if_block) if_block.m(div, null);
    			append(div, t);

    			if (default_slot) {
    				default_slot.m(div, null);
    			}

    			/*div_binding*/ ctx[25](div);
    			current = true;
    			if (remount) dispose();
    			dispose = listen(div, "click", /*onClick*/ ctx[7]);
    		},
    		p(ctx, dirty) {
    			if (typeof /*text*/ ctx[0] !== "undefined" || /*hasTextSlots*/ ctx[3] || /*hasIcon*/ ctx[5]) {
    				if (if_block) {
    					if_block.p(ctx, dirty);

    					if (dirty & /*text, hasTextSlots, hasIcon*/ 41) {
    						transition_in(if_block, 1);
    					}
    				} else {
    					if_block = create_if_block_3$1(ctx);
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
    				if (default_slot.p && dirty & /*$$scope*/ 4194304) {
    					default_slot.p(get_slot_context(default_slot_template, ctx, /*$$scope*/ ctx[22], null), get_slot_changes(default_slot_template, /*$$scope*/ ctx[22], dirty, null));
    				}
    			}

    			set_attributes(div, get_spread_update(div_levels, [
    				dirty & /*classes*/ 16 && { class: /*classes*/ ctx[4] },
    				dirty & /*attrs*/ 4 && /*attrs*/ ctx[2]
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
    			/*div_binding*/ ctx[25](null);
    			dispose();
    		}
    	};
    }

    // (99:0) {#if isLink}
    function create_if_block$2(ctx) {
    	let a;
    	let t;
    	let current;
    	let dispose;
    	let if_block = (typeof /*text*/ ctx[0] !== "undefined" || /*hasTextSlots*/ ctx[3] || /*hasIcon*/ ctx[5]) && create_if_block_1$1(ctx);
    	const default_slot_template = /*$$slots*/ ctx[23].default;
    	const default_slot = create_slot(default_slot_template, ctx, /*$$scope*/ ctx[22], null);
    	let a_levels = [{ class: /*classes*/ ctx[4] }, /*attrs*/ ctx[2]];
    	let a_data = {};

    	for (let i = 0; i < a_levels.length; i += 1) {
    		a_data = assign(a_data, a_levels[i]);
    	}

    	return {
    		c() {
    			a = element("a");
    			if (if_block) if_block.c();
    			t = space();
    			if (default_slot) default_slot.c();
    			set_attributes(a, a_data);
    		},
    		m(target, anchor, remount) {
    			insert(target, a, anchor);
    			if (if_block) if_block.m(a, null);
    			append(a, t);

    			if (default_slot) {
    				default_slot.m(a, null);
    			}

    			/*a_binding*/ ctx[24](a);
    			current = true;
    			if (remount) dispose();
    			dispose = listen(a, "click", /*onClick*/ ctx[7]);
    		},
    		p(ctx, dirty) {
    			if (typeof /*text*/ ctx[0] !== "undefined" || /*hasTextSlots*/ ctx[3] || /*hasIcon*/ ctx[5]) {
    				if (if_block) {
    					if_block.p(ctx, dirty);

    					if (dirty & /*text, hasTextSlots, hasIcon*/ 41) {
    						transition_in(if_block, 1);
    					}
    				} else {
    					if_block = create_if_block_1$1(ctx);
    					if_block.c();
    					transition_in(if_block, 1);
    					if_block.m(a, t);
    				}
    			} else if (if_block) {
    				group_outros();

    				transition_out(if_block, 1, 1, () => {
    					if_block = null;
    				});

    				check_outros();
    			}

    			if (default_slot) {
    				if (default_slot.p && dirty & /*$$scope*/ 4194304) {
    					default_slot.p(get_slot_context(default_slot_template, ctx, /*$$scope*/ ctx[22], null), get_slot_changes(default_slot_template, /*$$scope*/ ctx[22], dirty, null));
    				}
    			}

    			set_attributes(a, get_spread_update(a_levels, [
    				dirty & /*classes*/ 16 && { class: /*classes*/ ctx[4] },
    				dirty & /*attrs*/ 4 && /*attrs*/ ctx[2]
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
    			if (detaching) detach(a);
    			if (if_block) if_block.d();
    			if (default_slot) default_slot.d(detaching);
    			/*a_binding*/ ctx[24](null);
    			dispose();
    		}
    	};
    }

    // (123:4) {#if typeof text !== 'undefined' || hasTextSlots || hasIcon}
    function create_if_block_3$1(ctx) {
    	let div;
    	let t0_value = Utils.text(/*text*/ ctx[0]) + "";
    	let t0;
    	let t1;
    	let t2;
    	let current;
    	let if_block = /*hasIcon*/ ctx[5] && create_if_block_4(ctx);
    	const text_slot_template = /*$$slots*/ ctx[23].text;
    	const text_slot = create_slot(text_slot_template, ctx, /*$$scope*/ ctx[22], get_text_slot_context_1);

    	return {
    		c() {
    			div = element("div");
    			t0 = text(t0_value);
    			t1 = space();
    			if (if_block) if_block.c();
    			t2 = space();
    			if (text_slot) text_slot.c();
    			attr(div, "class", "menu-item-content");
    		},
    		m(target, anchor) {
    			insert(target, div, anchor);
    			append(div, t0);
    			append(div, t1);
    			if (if_block) if_block.m(div, null);
    			append(div, t2);

    			if (text_slot) {
    				text_slot.m(div, null);
    			}

    			current = true;
    		},
    		p(ctx, dirty) {
    			if ((!current || dirty & /*text*/ 1) && t0_value !== (t0_value = Utils.text(/*text*/ ctx[0]) + "")) set_data(t0, t0_value);

    			if (/*hasIcon*/ ctx[5]) {
    				if (if_block) {
    					if_block.p(ctx, dirty);

    					if (dirty & /*hasIcon*/ 32) {
    						transition_in(if_block, 1);
    					}
    				} else {
    					if_block = create_if_block_4(ctx);
    					if_block.c();
    					transition_in(if_block, 1);
    					if_block.m(div, t2);
    				}
    			} else if (if_block) {
    				group_outros();

    				transition_out(if_block, 1, 1, () => {
    					if_block = null;
    				});

    				check_outros();
    			}

    			if (text_slot) {
    				if (text_slot.p && dirty & /*$$scope*/ 4194304) {
    					text_slot.p(get_slot_context(text_slot_template, ctx, /*$$scope*/ ctx[22], get_text_slot_context_1), get_slot_changes(text_slot_template, /*$$scope*/ ctx[22], dirty, get_text_slot_changes_1));
    				}
    			}
    		},
    		i(local) {
    			if (current) return;
    			transition_in(if_block);
    			transition_in(text_slot, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(if_block);
    			transition_out(text_slot, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(div);
    			if (if_block) if_block.d();
    			if (text_slot) text_slot.d(detaching);
    		}
    	};
    }

    // (126:8) {#if hasIcon}
    function create_if_block_4(ctx) {
    	let current;

    	const icon = new Icon({
    			props: {
    				material: /*$$props*/ ctx[8].iconMaterial,
    				f7: /*$$props*/ ctx[8].iconF7,
    				icon: /*$$props*/ ctx[8].icon,
    				md: /*$$props*/ ctx[8].iconMd,
    				ios: /*$$props*/ ctx[8].iconIos,
    				aurora: /*$$props*/ ctx[8].iconAurora,
    				color: /*$$props*/ ctx[8].iconColor,
    				size: /*$$props*/ ctx[8].iconSize
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
    			if (dirty & /*$$props*/ 256) icon_changes.material = /*$$props*/ ctx[8].iconMaterial;
    			if (dirty & /*$$props*/ 256) icon_changes.f7 = /*$$props*/ ctx[8].iconF7;
    			if (dirty & /*$$props*/ 256) icon_changes.icon = /*$$props*/ ctx[8].icon;
    			if (dirty & /*$$props*/ 256) icon_changes.md = /*$$props*/ ctx[8].iconMd;
    			if (dirty & /*$$props*/ 256) icon_changes.ios = /*$$props*/ ctx[8].iconIos;
    			if (dirty & /*$$props*/ 256) icon_changes.aurora = /*$$props*/ ctx[8].iconAurora;
    			if (dirty & /*$$props*/ 256) icon_changes.color = /*$$props*/ ctx[8].iconColor;
    			if (dirty & /*$$props*/ 256) icon_changes.size = /*$$props*/ ctx[8].iconSize;
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

    // (101:4) {#if typeof text !== 'undefined' || hasTextSlots || hasIcon}
    function create_if_block_1$1(ctx) {
    	let div;
    	let t0_value = Utils.text(/*text*/ ctx[0]) + "";
    	let t0;
    	let t1;
    	let t2;
    	let current;
    	let if_block = /*hasIcon*/ ctx[5] && create_if_block_2$1(ctx);
    	const text_slot_template = /*$$slots*/ ctx[23].text;
    	const text_slot = create_slot(text_slot_template, ctx, /*$$scope*/ ctx[22], get_text_slot_context);

    	return {
    		c() {
    			div = element("div");
    			t0 = text(t0_value);
    			t1 = space();
    			if (if_block) if_block.c();
    			t2 = space();
    			if (text_slot) text_slot.c();
    			attr(div, "class", "menu-item-content");
    		},
    		m(target, anchor) {
    			insert(target, div, anchor);
    			append(div, t0);
    			append(div, t1);
    			if (if_block) if_block.m(div, null);
    			append(div, t2);

    			if (text_slot) {
    				text_slot.m(div, null);
    			}

    			current = true;
    		},
    		p(ctx, dirty) {
    			if ((!current || dirty & /*text*/ 1) && t0_value !== (t0_value = Utils.text(/*text*/ ctx[0]) + "")) set_data(t0, t0_value);

    			if (/*hasIcon*/ ctx[5]) {
    				if (if_block) {
    					if_block.p(ctx, dirty);

    					if (dirty & /*hasIcon*/ 32) {
    						transition_in(if_block, 1);
    					}
    				} else {
    					if_block = create_if_block_2$1(ctx);
    					if_block.c();
    					transition_in(if_block, 1);
    					if_block.m(div, t2);
    				}
    			} else if (if_block) {
    				group_outros();

    				transition_out(if_block, 1, 1, () => {
    					if_block = null;
    				});

    				check_outros();
    			}

    			if (text_slot) {
    				if (text_slot.p && dirty & /*$$scope*/ 4194304) {
    					text_slot.p(get_slot_context(text_slot_template, ctx, /*$$scope*/ ctx[22], get_text_slot_context), get_slot_changes(text_slot_template, /*$$scope*/ ctx[22], dirty, get_text_slot_changes));
    				}
    			}
    		},
    		i(local) {
    			if (current) return;
    			transition_in(if_block);
    			transition_in(text_slot, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(if_block);
    			transition_out(text_slot, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(div);
    			if (if_block) if_block.d();
    			if (text_slot) text_slot.d(detaching);
    		}
    	};
    }

    // (104:8) {#if hasIcon}
    function create_if_block_2$1(ctx) {
    	let current;

    	const icon = new Icon({
    			props: {
    				material: /*$$props*/ ctx[8].iconMaterial,
    				f7: /*$$props*/ ctx[8].iconF7,
    				icon: /*$$props*/ ctx[8].icon,
    				md: /*$$props*/ ctx[8].iconMd,
    				ios: /*$$props*/ ctx[8].iconIos,
    				aurora: /*$$props*/ ctx[8].iconAurora,
    				color: /*$$props*/ ctx[8].iconColor,
    				size: /*$$props*/ ctx[8].iconSize
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
    			if (dirty & /*$$props*/ 256) icon_changes.material = /*$$props*/ ctx[8].iconMaterial;
    			if (dirty & /*$$props*/ 256) icon_changes.f7 = /*$$props*/ ctx[8].iconF7;
    			if (dirty & /*$$props*/ 256) icon_changes.icon = /*$$props*/ ctx[8].icon;
    			if (dirty & /*$$props*/ 256) icon_changes.md = /*$$props*/ ctx[8].iconMd;
    			if (dirty & /*$$props*/ 256) icon_changes.ios = /*$$props*/ ctx[8].iconIos;
    			if (dirty & /*$$props*/ 256) icon_changes.aurora = /*$$props*/ ctx[8].iconAurora;
    			if (dirty & /*$$props*/ 256) icon_changes.color = /*$$props*/ ctx[8].iconColor;
    			if (dirty & /*$$props*/ 256) icon_changes.size = /*$$props*/ ctx[8].iconSize;
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

    function create_fragment$8(ctx) {
    	let current_block_type_index;
    	let if_block;
    	let if_block_anchor;
    	let current;
    	const if_block_creators = [create_if_block$2, create_else_block$1];
    	const if_blocks = [];

    	function select_block_type(ctx, dirty) {
    		if (/*isLink*/ ctx[6]) return 0;
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
    		p(ctx, [dirty]) {
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

    function instance$8($$self, $$props, $$invalidate) {
    	const omit_props_names = ["class","text","iconOnly","href","link","target","dropdown"];
    	let $$restProps = compute_rest_props($$props, omit_props_names);
    	const dispatch = createEventDispatcher();
    	let { class: className = undefined } = $$props;
    	let { text = undefined } = $$props;
    	let { iconOnly = undefined } = $$props;
    	let { href = undefined } = $$props;
    	let { link = undefined } = $$props;
    	let { target = undefined } = $$props;
    	let { dropdown = undefined } = $$props;
    	let el;

    	function onClick(e) {
    		dispatch("click", [e]);
    		if (typeof $$props.onClick === "function") $$props.onClick(e);
    	}

    	function onOpened(itemEl) {
    		if (itemEl !== el) return;
    		dispatch("menuOpened", [el]);
    		if (typeof $$props.onMenuOpened === "function") $$props.onMenuOpened(el);
    	}

    	function onClosed(itemEl) {
    		if (itemEl !== el) return;
    		dispatch("menuClosed", [el]);
    		if (typeof $$props.onMenuClosed === "function") $$props.onMenuClosed(el);
    	}

    	onMount(() => {
    		if ($$props.routeProps) {
    			$$invalidate(1, el.f7RouteProps = $$props.routeProps, el);
    		}

    		f7.ready(() => {
    			f7.instance.on("menuOpened", onOpened);
    			f7.instance.on("menuClosed", onClosed);
    		});
    	});

    	afterUpdate(() => {
    		if ($$props.routeProps) {
    			$$invalidate(1, el.f7RouteProps = $$props.routeProps, el);
    		}
    	});

    	onDestroy(() => {
    		if (!el || !f7.instance) return;
    		delete el.f7RouteProps;
    		f7.instance.off("menuOpened", onOpened);
    		f7.instance.off("menuClosed", onClosed);
    	});

    	let { $$slots = {}, $$scope } = $$props;

    	function a_binding($$value) {
    		binding_callbacks[$$value ? "unshift" : "push"](() => {
    			$$invalidate(1, el = $$value);
    		});
    	}

    	function div_binding($$value) {
    		binding_callbacks[$$value ? "unshift" : "push"](() => {
    			$$invalidate(1, el = $$value);
    		});
    	}

    	$$self.$set = $$new_props => {
    		$$invalidate(8, $$props = assign(assign({}, $$props), exclude_internal_props($$new_props)));
    		$$invalidate(21, $$restProps = compute_rest_props($$props, omit_props_names));
    		if ("class" in $$new_props) $$invalidate(9, className = $$new_props.class);
    		if ("text" in $$new_props) $$invalidate(0, text = $$new_props.text);
    		if ("iconOnly" in $$new_props) $$invalidate(10, iconOnly = $$new_props.iconOnly);
    		if ("href" in $$new_props) $$invalidate(11, href = $$new_props.href);
    		if ("link" in $$new_props) $$invalidate(12, link = $$new_props.link);
    		if ("target" in $$new_props) $$invalidate(13, target = $$new_props.target);
    		if ("dropdown" in $$new_props) $$invalidate(14, dropdown = $$new_props.dropdown);
    		if ("$$scope" in $$new_props) $$invalidate(22, $$scope = $$new_props.$$scope);
    	};

    	let hrefComputed;
    	let attrs;
    	let hasDefaultSlots;
    	let hasTextSlots;
    	let iconOnlyComputed;
    	let classes;
    	let hasIcon;
    	let isLink;

    	$$self.$$.update = () => {
    		if ($$self.$$.dirty & /*href, link*/ 6144) {
    			 $$invalidate(15, hrefComputed = typeof href === "undefined" && link ? "#" : href);
    		}

    		 $$invalidate(2, attrs = Utils.extend(
    			{
    				href: hrefComputed,
    				target,
    				...restProps($$restProps)
    			},
    			Mixins.linkRouterAttrs($$props),
    			Mixins.linkActionsAttrs($$props)
    		));

    		if ($$self.$$.dirty & /*iconOnly, text, hasTextSlots*/ 1033) {
    			 $$invalidate(17, iconOnlyComputed = iconOnly || !text && !hasTextSlots);
    		}

    		 $$invalidate(4, classes = Utils.classNames(
    			{
    				"menu-item": true,
    				"menu-item-dropdown": dropdown || dropdown === "",
    				"icon-only": iconOnlyComputed
    			},
    			className,
    			Mixins.colorClasses($$props),
    			Mixins.linkRouterClasses($$props),
    			Mixins.linkActionsClasses($$props)
    		));

    		 $$invalidate(5, hasIcon = $$props.icon || $$props.iconMaterial || $$props.iconF7 || $$props.iconMd || $$props.iconIos || $$props.iconAurora);

    		if ($$self.$$.dirty & /*link, href*/ 6144) {
    			 $$invalidate(6, isLink = link || href || href === "");
    		}
    	};

    	 hasDefaultSlots = hasSlots(arguments, "default");

    	// eslint-disable-next-line
    	 $$invalidate(3, hasTextSlots = hasSlots(arguments, "text"));

    	$$props = exclude_internal_props($$props);

    	return [
    		text,
    		el,
    		attrs,
    		hasTextSlots,
    		classes,
    		hasIcon,
    		isLink,
    		onClick,
    		$$props,
    		className,
    		iconOnly,
    		href,
    		link,
    		target,
    		dropdown,
    		hrefComputed,
    		hasDefaultSlots,
    		iconOnlyComputed,
    		dispatch,
    		onOpened,
    		onClosed,
    		$$restProps,
    		$$scope,
    		$$slots,
    		a_binding,
    		div_binding
    	];
    }

    class Menu_item extends SvelteComponent {
    	constructor(options) {
    		super();

    		init(this, options, instance$8, create_fragment$8, safe_not_equal, {
    			class: 9,
    			text: 0,
    			iconOnly: 10,
    			href: 11,
    			link: 12,
    			target: 13,
    			dropdown: 14
    		});
    	}
    }

    /* public/packages/svelte/components/menu.svelte generated by Svelte v3.22.3 */

    function create_fragment$9(ctx) {
    	let div1;
    	let div0;
    	let current;
    	const default_slot_template = /*$$slots*/ ctx[5].default;
    	const default_slot = create_slot(default_slot_template, ctx, /*$$scope*/ ctx[4], null);
    	let div1_levels = [{ class: /*classes*/ ctx[0] }, restProps(/*$$restProps*/ ctx[1])];
    	let div1_data = {};

    	for (let i = 0; i < div1_levels.length; i += 1) {
    		div1_data = assign(div1_data, div1_levels[i]);
    	}

    	return {
    		c() {
    			div1 = element("div");
    			div0 = element("div");
    			if (default_slot) default_slot.c();
    			attr(div0, "class", "menu-inner");
    			set_attributes(div1, div1_data);
    		},
    		m(target, anchor) {
    			insert(target, div1, anchor);
    			append(div1, div0);

    			if (default_slot) {
    				default_slot.m(div0, null);
    			}

    			current = true;
    		},
    		p(ctx, [dirty]) {
    			if (default_slot) {
    				if (default_slot.p && dirty & /*$$scope*/ 16) {
    					default_slot.p(get_slot_context(default_slot_template, ctx, /*$$scope*/ ctx[4], null), get_slot_changes(default_slot_template, /*$$scope*/ ctx[4], dirty, null));
    				}
    			}

    			set_attributes(div1, get_spread_update(div1_levels, [
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
    			if (detaching) detach(div1);
    			if (default_slot) default_slot.d(detaching);
    		}
    	};
    }

    function instance$9($$self, $$props, $$invalidate) {
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
    		 $$invalidate(0, classes = Utils.classNames(className, "menu", Mixins.colorClasses($$props)));
    	};

    	$$props = exclude_internal_props($$props);
    	return [classes, $$restProps, className, $$props, $$scope, $$slots];
    }

    class Menu extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance$9, create_fragment$9, safe_not_equal, { class: 2 });
    	}
    }

    /* public/packages/svelte/components/nav-left.svelte generated by Svelte v3.22.3 */

    function create_if_block$3(ctx) {
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

    function create_fragment$a(ctx) {
    	let div;
    	let t;
    	let current;
    	let if_block = /*backLink*/ ctx[0] && create_if_block$3(ctx);
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
    					if_block = create_if_block$3(ctx);
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

    function instance$a($$self, $$props, $$invalidate) {
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

    		init(this, options, instance$a, create_fragment$a, safe_not_equal, {
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

    function create_fragment$b(ctx) {
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

    function instance$b($$self, $$props, $$invalidate) {
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
    		init(this, options, instance$b, create_fragment$b, safe_not_equal, { class: 2, sliding: 3 });
    	}
    }

    /* public/packages/svelte/components/nav-title.svelte generated by Svelte v3.22.3 */

    function create_if_block_1$2(ctx) {
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
    function create_if_block$4(ctx) {
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

    function create_fragment$c(ctx) {
    	let div;
    	let t0;
    	let t1;
    	let current;
    	let if_block0 = typeof /*title*/ ctx[0] !== "undefined" && create_if_block_1$2(ctx);
    	let if_block1 = typeof /*subtitle*/ ctx[1] !== "undefined" && create_if_block$4(ctx);
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
    					if_block0 = create_if_block_1$2(ctx);
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
    					if_block1 = create_if_block$4(ctx);
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

    function instance$c($$self, $$props, $$invalidate) {
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

    		init(this, options, instance$c, create_fragment$c, safe_not_equal, {
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
    const get_title_slot_changes = dirty => ({});
    const get_title_slot_context = ctx => ({});
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
    function create_if_block_2$2(ctx) {
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
    function create_if_block_1$3(ctx) {
    	let current;

    	const navright = new Nav_right({
    			props: {
    				$$slots: { default: [create_default_slot$1] },
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
    function create_default_slot$1(ctx) {
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
    function create_if_block$5(ctx) {
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

    function create_fragment$d(ctx) {
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
    	let if_block1 = (/*title*/ ctx[4] || /*subtitle*/ ctx[5] || /*hasTitleSlots*/ ctx[10]) && create_if_block_2$2(ctx);
    	let if_block2 = /*hasRightSlots*/ ctx[9] && create_if_block_1$3(ctx);
    	let if_block3 = (/*largeTitle*/ ctx[11] || /*hasTitleLargeSlots*/ ctx[12]) && create_if_block$5(ctx);
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
    					if_block1 = create_if_block_2$2(ctx);
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
    					if_block2 = create_if_block_1$3(ctx);
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
    					if_block3 = create_if_block$5(ctx);
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

    function instance$d($$self, $$props, $$invalidate) {
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
    			instance$d,
    			create_fragment$d,
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
    function create_if_block_2$3(ctx) {
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
    function create_if_block_1$4(ctx) {
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
    function create_if_block$6(ctx) {
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

    function create_fragment$e(ctx) {
    	let span;

    	function select_block_type(ctx, dirty) {
    		if (/*_theme*/ ctx[0] && /*_theme*/ ctx[0].md) return create_if_block$6;
    		if (/*_theme*/ ctx[0] && /*_theme*/ ctx[0].ios) return create_if_block_1$4;
    		if (/*_theme*/ ctx[0] && /*_theme*/ ctx[0].aurora) return create_if_block_2$3;
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

    function instance$e($$self, $$props, $$invalidate) {
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
    		init(this, options, instance$e, create_fragment$e, safe_not_equal, { style: 4, class: 5, size: 6 });
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
    function create_if_block_2$4(ctx) {
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
    function create_if_block_1$5(ctx) {
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
    function create_if_block$7(ctx) {
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

    function create_fragment$f(ctx) {
    	let div;
    	let t0;
    	let t1;
    	let t2;
    	let t3;
    	let current;
    	let if_block0 = /*ptr*/ ctx[0] && /*ptrPreloader*/ ctx[2] && !/*ptrBottom*/ ctx[3] && create_if_block_3$3();
    	let if_block1 = /*infinite*/ ctx[5] && /*infiniteTop*/ ctx[6] && /*infinitePreloader*/ ctx[8] && create_if_block_2$4();
    	const default_slot_template = /*$$slots*/ ctx[33].default;
    	const default_slot = create_slot(default_slot_template, ctx, /*$$scope*/ ctx[32], null);
    	let if_block2 = /*infinite*/ ctx[5] && !/*infiniteTop*/ ctx[6] && /*infinitePreloader*/ ctx[8] && create_if_block_1$5();
    	let if_block3 = /*ptr*/ ctx[0] && /*ptrPreloader*/ ctx[2] && /*ptrBottom*/ ctx[3] && create_if_block$7();

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
    					if_block1 = create_if_block_2$4();
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
    					if_block2 = create_if_block_1$5();
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
    					if_block3 = create_if_block$7();
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

    function instance$f($$self, $$props, $$invalidate) {
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
    			instance$f,
    			create_fragment$f,
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
    function create_if_block$8(ctx) {
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
    				$$slots: { default: [create_default_slot$2] },
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
    function create_default_slot$2(ctx) {
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

    function create_fragment$g(ctx) {
    	let div;
    	let t;
    	let current_block_type_index;
    	let if_block;
    	let current;
    	const fixed_slot_template = /*$$slots*/ ctx[71].fixed;
    	const fixed_slot = create_slot(fixed_slot_template, ctx, /*$$scope*/ ctx[73], get_fixed_slot_context);
    	const if_block_creators = [create_if_block$8, create_else_block$3];
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

    function instance$g($$self, $$props, $$invalidate) {
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
    			instance$g,
    			create_fragment$g,
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

    function create_fragment$h(ctx) {
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

    		init(this, options, instance_1, create_fragment$h, safe_not_equal, {
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

    /* src/pug/docs-demos/svelte/menu.svelte generated by Svelte v3.22.3 */

    function create_default_slot_16(ctx) {
    	let t;

    	return {
    		c() {
    			t = text("Plain Links");
    		},
    		m(target, anchor) {
    			insert(target, t, anchor);
    		},
    		d(detaching) {
    			if (detaching) detach(t);
    		}
    	};
    }

    // (8:6) <Menu>
    function create_default_slot_15(ctx) {
    	let t0;
    	let t1;
    	let t2;
    	let current;
    	const menuitem0 = new Menu_item({ props: { href: "#", text: "Item 1" } });
    	const menuitem1 = new Menu_item({ props: { href: "#", text: "Item 2" } });
    	const menuitem2 = new Menu_item({ props: { href: "#", iconF7: "pencil" } });

    	const menuitem3 = new Menu_item({
    			props: { href: "#", iconF7: "square_arrow_up" }
    		});

    	return {
    		c() {
    			create_component(menuitem0.$$.fragment);
    			t0 = space();
    			create_component(menuitem1.$$.fragment);
    			t1 = space();
    			create_component(menuitem2.$$.fragment);
    			t2 = space();
    			create_component(menuitem3.$$.fragment);
    		},
    		m(target, anchor) {
    			mount_component(menuitem0, target, anchor);
    			insert(target, t0, anchor);
    			mount_component(menuitem1, target, anchor);
    			insert(target, t1, anchor);
    			mount_component(menuitem2, target, anchor);
    			insert(target, t2, anchor);
    			mount_component(menuitem3, target, anchor);
    			current = true;
    		},
    		p: noop,
    		i(local) {
    			if (current) return;
    			transition_in(menuitem0.$$.fragment, local);
    			transition_in(menuitem1.$$.fragment, local);
    			transition_in(menuitem2.$$.fragment, local);
    			transition_in(menuitem3.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(menuitem0.$$.fragment, local);
    			transition_out(menuitem1.$$.fragment, local);
    			transition_out(menuitem2.$$.fragment, local);
    			transition_out(menuitem3.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			destroy_component(menuitem0, detaching);
    			if (detaching) detach(t0);
    			destroy_component(menuitem1, detaching);
    			if (detaching) detach(t1);
    			destroy_component(menuitem2, detaching);
    			if (detaching) detach(t2);
    			destroy_component(menuitem3, detaching);
    		}
    	};
    }

    // (15:6) <BlockTitle>
    function create_default_slot_14(ctx) {
    	let t;

    	return {
    		c() {
    			t = text("Dropdowns");
    		},
    		m(target, anchor) {
    			insert(target, t, anchor);
    		},
    		d(detaching) {
    			if (detaching) detach(t);
    		}
    	};
    }

    // (18:10) <MenuDropdown left>
    function create_default_slot_13(ctx) {
    	let t0;
    	let t1;
    	let t2;
    	let t3;
    	let t4;
    	let t5;
    	let current;

    	const menudropdownitem0 = new Menu_dropdown_item({
    			props: { href: "#", text: "Menu Item 1" }
    		});

    	const menudropdownitem1 = new Menu_dropdown_item({
    			props: { href: "#", text: "Menu Item 2" }
    		});

    	const menudropdownitem2 = new Menu_dropdown_item({
    			props: { href: "#", text: "Menu Item 3" }
    		});

    	const menudropdownitem3 = new Menu_dropdown_item({
    			props: { href: "#", text: "Menu Item 4" }
    		});

    	const menudropdownitem4 = new Menu_dropdown_item({ props: { divider: true } });

    	const menudropdownitem5 = new Menu_dropdown_item({
    			props: { href: "#", text: "Menu Item 5" }
    		});

    	const menudropdownitem6 = new Menu_dropdown_item({
    			props: { href: "#", text: "Menu Item 6" }
    		});

    	return {
    		c() {
    			create_component(menudropdownitem0.$$.fragment);
    			t0 = space();
    			create_component(menudropdownitem1.$$.fragment);
    			t1 = space();
    			create_component(menudropdownitem2.$$.fragment);
    			t2 = space();
    			create_component(menudropdownitem3.$$.fragment);
    			t3 = space();
    			create_component(menudropdownitem4.$$.fragment);
    			t4 = space();
    			create_component(menudropdownitem5.$$.fragment);
    			t5 = space();
    			create_component(menudropdownitem6.$$.fragment);
    		},
    		m(target, anchor) {
    			mount_component(menudropdownitem0, target, anchor);
    			insert(target, t0, anchor);
    			mount_component(menudropdownitem1, target, anchor);
    			insert(target, t1, anchor);
    			mount_component(menudropdownitem2, target, anchor);
    			insert(target, t2, anchor);
    			mount_component(menudropdownitem3, target, anchor);
    			insert(target, t3, anchor);
    			mount_component(menudropdownitem4, target, anchor);
    			insert(target, t4, anchor);
    			mount_component(menudropdownitem5, target, anchor);
    			insert(target, t5, anchor);
    			mount_component(menudropdownitem6, target, anchor);
    			current = true;
    		},
    		p: noop,
    		i(local) {
    			if (current) return;
    			transition_in(menudropdownitem0.$$.fragment, local);
    			transition_in(menudropdownitem1.$$.fragment, local);
    			transition_in(menudropdownitem2.$$.fragment, local);
    			transition_in(menudropdownitem3.$$.fragment, local);
    			transition_in(menudropdownitem4.$$.fragment, local);
    			transition_in(menudropdownitem5.$$.fragment, local);
    			transition_in(menudropdownitem6.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(menudropdownitem0.$$.fragment, local);
    			transition_out(menudropdownitem1.$$.fragment, local);
    			transition_out(menudropdownitem2.$$.fragment, local);
    			transition_out(menudropdownitem3.$$.fragment, local);
    			transition_out(menudropdownitem4.$$.fragment, local);
    			transition_out(menudropdownitem5.$$.fragment, local);
    			transition_out(menudropdownitem6.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			destroy_component(menudropdownitem0, detaching);
    			if (detaching) detach(t0);
    			destroy_component(menudropdownitem1, detaching);
    			if (detaching) detach(t1);
    			destroy_component(menudropdownitem2, detaching);
    			if (detaching) detach(t2);
    			destroy_component(menudropdownitem3, detaching);
    			if (detaching) detach(t3);
    			destroy_component(menudropdownitem4, detaching);
    			if (detaching) detach(t4);
    			destroy_component(menudropdownitem5, detaching);
    			if (detaching) detach(t5);
    			destroy_component(menudropdownitem6, detaching);
    		}
    	};
    }

    // (17:8) <MenuItem text="Left" dropdown>
    function create_default_slot_12(ctx) {
    	let current;

    	const menudropdown = new Menu_dropdown({
    			props: {
    				left: true,
    				$$slots: { default: [create_default_slot_13] },
    				$$scope: { ctx }
    			}
    		});

    	return {
    		c() {
    			create_component(menudropdown.$$.fragment);
    		},
    		m(target, anchor) {
    			mount_component(menudropdown, target, anchor);
    			current = true;
    		},
    		p(ctx, dirty) {
    			const menudropdown_changes = {};

    			if (dirty & /*$$scope*/ 1) {
    				menudropdown_changes.$$scope = { dirty, ctx };
    			}

    			menudropdown.$set(menudropdown_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(menudropdown.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(menudropdown.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			destroy_component(menudropdown, detaching);
    		}
    	};
    }

    // (30:10) <MenuDropdown center contentHeight="200px">
    function create_default_slot_11(ctx) {
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
    	let current;

    	const menudropdownitem0 = new Menu_dropdown_item({
    			props: { href: "#", text: "Menu Item 1" }
    		});

    	const menudropdownitem1 = new Menu_dropdown_item({
    			props: { href: "#", text: "Menu Item 2" }
    		});

    	const menudropdownitem2 = new Menu_dropdown_item({
    			props: { href: "#", text: "Menu Item 3" }
    		});

    	const menudropdownitem3 = new Menu_dropdown_item({
    			props: { href: "#", text: "Menu Item 4" }
    		});

    	const menudropdownitem4 = new Menu_dropdown_item({ props: { divider: true } });

    	const menudropdownitem5 = new Menu_dropdown_item({
    			props: { href: "#", text: "Menu Item 5" }
    		});

    	const menudropdownitem6 = new Menu_dropdown_item({
    			props: { href: "#", text: "Menu Item 6" }
    		});

    	const menudropdownitem7 = new Menu_dropdown_item({
    			props: { href: "#", text: "Menu Item 7" }
    		});

    	const menudropdownitem8 = new Menu_dropdown_item({ props: { divider: true } });

    	const menudropdownitem9 = new Menu_dropdown_item({
    			props: { href: "#", text: "Menu Item 8" }
    		});

    	const menudropdownitem10 = new Menu_dropdown_item({
    			props: { href: "#", text: "Menu Item 9" }
    		});

    	const menudropdownitem11 = new Menu_dropdown_item({
    			props: { href: "#", text: "Menu Item 10" }
    		});

    	return {
    		c() {
    			create_component(menudropdownitem0.$$.fragment);
    			t0 = space();
    			create_component(menudropdownitem1.$$.fragment);
    			t1 = space();
    			create_component(menudropdownitem2.$$.fragment);
    			t2 = space();
    			create_component(menudropdownitem3.$$.fragment);
    			t3 = space();
    			create_component(menudropdownitem4.$$.fragment);
    			t4 = space();
    			create_component(menudropdownitem5.$$.fragment);
    			t5 = space();
    			create_component(menudropdownitem6.$$.fragment);
    			t6 = space();
    			create_component(menudropdownitem7.$$.fragment);
    			t7 = space();
    			create_component(menudropdownitem8.$$.fragment);
    			t8 = space();
    			create_component(menudropdownitem9.$$.fragment);
    			t9 = space();
    			create_component(menudropdownitem10.$$.fragment);
    			t10 = space();
    			create_component(menudropdownitem11.$$.fragment);
    		},
    		m(target, anchor) {
    			mount_component(menudropdownitem0, target, anchor);
    			insert(target, t0, anchor);
    			mount_component(menudropdownitem1, target, anchor);
    			insert(target, t1, anchor);
    			mount_component(menudropdownitem2, target, anchor);
    			insert(target, t2, anchor);
    			mount_component(menudropdownitem3, target, anchor);
    			insert(target, t3, anchor);
    			mount_component(menudropdownitem4, target, anchor);
    			insert(target, t4, anchor);
    			mount_component(menudropdownitem5, target, anchor);
    			insert(target, t5, anchor);
    			mount_component(menudropdownitem6, target, anchor);
    			insert(target, t6, anchor);
    			mount_component(menudropdownitem7, target, anchor);
    			insert(target, t7, anchor);
    			mount_component(menudropdownitem8, target, anchor);
    			insert(target, t8, anchor);
    			mount_component(menudropdownitem9, target, anchor);
    			insert(target, t9, anchor);
    			mount_component(menudropdownitem10, target, anchor);
    			insert(target, t10, anchor);
    			mount_component(menudropdownitem11, target, anchor);
    			current = true;
    		},
    		p: noop,
    		i(local) {
    			if (current) return;
    			transition_in(menudropdownitem0.$$.fragment, local);
    			transition_in(menudropdownitem1.$$.fragment, local);
    			transition_in(menudropdownitem2.$$.fragment, local);
    			transition_in(menudropdownitem3.$$.fragment, local);
    			transition_in(menudropdownitem4.$$.fragment, local);
    			transition_in(menudropdownitem5.$$.fragment, local);
    			transition_in(menudropdownitem6.$$.fragment, local);
    			transition_in(menudropdownitem7.$$.fragment, local);
    			transition_in(menudropdownitem8.$$.fragment, local);
    			transition_in(menudropdownitem9.$$.fragment, local);
    			transition_in(menudropdownitem10.$$.fragment, local);
    			transition_in(menudropdownitem11.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(menudropdownitem0.$$.fragment, local);
    			transition_out(menudropdownitem1.$$.fragment, local);
    			transition_out(menudropdownitem2.$$.fragment, local);
    			transition_out(menudropdownitem3.$$.fragment, local);
    			transition_out(menudropdownitem4.$$.fragment, local);
    			transition_out(menudropdownitem5.$$.fragment, local);
    			transition_out(menudropdownitem6.$$.fragment, local);
    			transition_out(menudropdownitem7.$$.fragment, local);
    			transition_out(menudropdownitem8.$$.fragment, local);
    			transition_out(menudropdownitem9.$$.fragment, local);
    			transition_out(menudropdownitem10.$$.fragment, local);
    			transition_out(menudropdownitem11.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			destroy_component(menudropdownitem0, detaching);
    			if (detaching) detach(t0);
    			destroy_component(menudropdownitem1, detaching);
    			if (detaching) detach(t1);
    			destroy_component(menudropdownitem2, detaching);
    			if (detaching) detach(t2);
    			destroy_component(menudropdownitem3, detaching);
    			if (detaching) detach(t3);
    			destroy_component(menudropdownitem4, detaching);
    			if (detaching) detach(t4);
    			destroy_component(menudropdownitem5, detaching);
    			if (detaching) detach(t5);
    			destroy_component(menudropdownitem6, detaching);
    			if (detaching) detach(t6);
    			destroy_component(menudropdownitem7, detaching);
    			if (detaching) detach(t7);
    			destroy_component(menudropdownitem8, detaching);
    			if (detaching) detach(t8);
    			destroy_component(menudropdownitem9, detaching);
    			if (detaching) detach(t9);
    			destroy_component(menudropdownitem10, detaching);
    			if (detaching) detach(t10);
    			destroy_component(menudropdownitem11, detaching);
    		}
    	};
    }

    // (29:8) <MenuItem text="Center" dropdown>
    function create_default_slot_10(ctx) {
    	let current;

    	const menudropdown = new Menu_dropdown({
    			props: {
    				center: true,
    				contentHeight: "200px",
    				$$slots: { default: [create_default_slot_11] },
    				$$scope: { ctx }
    			}
    		});

    	return {
    		c() {
    			create_component(menudropdown.$$.fragment);
    		},
    		m(target, anchor) {
    			mount_component(menudropdown, target, anchor);
    			current = true;
    		},
    		p(ctx, dirty) {
    			const menudropdown_changes = {};

    			if (dirty & /*$$scope*/ 1) {
    				menudropdown_changes.$$scope = { dirty, ctx };
    			}

    			menudropdown.$set(menudropdown_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(menudropdown.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(menudropdown.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			destroy_component(menudropdown, detaching);
    		}
    	};
    }

    // (47:10) <MenuDropdown right>
    function create_default_slot_9(ctx) {
    	let t0;
    	let t1;
    	let t2;
    	let t3;
    	let t4;
    	let t5;
    	let current;

    	const menudropdownitem0 = new Menu_dropdown_item({
    			props: { href: "#", text: "Menu Item 1" }
    		});

    	const menudropdownitem1 = new Menu_dropdown_item({
    			props: { href: "#", text: "Menu Item 2" }
    		});

    	const menudropdownitem2 = new Menu_dropdown_item({
    			props: { href: "#", text: "Menu Item 3" }
    		});

    	const menudropdownitem3 = new Menu_dropdown_item({
    			props: { href: "#", text: "Menu Item 4" }
    		});

    	const menudropdownitem4 = new Menu_dropdown_item({ props: { divider: true } });

    	const menudropdownitem5 = new Menu_dropdown_item({
    			props: { href: "#", text: "Menu Item 5" }
    		});

    	const menudropdownitem6 = new Menu_dropdown_item({
    			props: { href: "#", text: "Menu Item 6" }
    		});

    	return {
    		c() {
    			create_component(menudropdownitem0.$$.fragment);
    			t0 = space();
    			create_component(menudropdownitem1.$$.fragment);
    			t1 = space();
    			create_component(menudropdownitem2.$$.fragment);
    			t2 = space();
    			create_component(menudropdownitem3.$$.fragment);
    			t3 = space();
    			create_component(menudropdownitem4.$$.fragment);
    			t4 = space();
    			create_component(menudropdownitem5.$$.fragment);
    			t5 = space();
    			create_component(menudropdownitem6.$$.fragment);
    		},
    		m(target, anchor) {
    			mount_component(menudropdownitem0, target, anchor);
    			insert(target, t0, anchor);
    			mount_component(menudropdownitem1, target, anchor);
    			insert(target, t1, anchor);
    			mount_component(menudropdownitem2, target, anchor);
    			insert(target, t2, anchor);
    			mount_component(menudropdownitem3, target, anchor);
    			insert(target, t3, anchor);
    			mount_component(menudropdownitem4, target, anchor);
    			insert(target, t4, anchor);
    			mount_component(menudropdownitem5, target, anchor);
    			insert(target, t5, anchor);
    			mount_component(menudropdownitem6, target, anchor);
    			current = true;
    		},
    		p: noop,
    		i(local) {
    			if (current) return;
    			transition_in(menudropdownitem0.$$.fragment, local);
    			transition_in(menudropdownitem1.$$.fragment, local);
    			transition_in(menudropdownitem2.$$.fragment, local);
    			transition_in(menudropdownitem3.$$.fragment, local);
    			transition_in(menudropdownitem4.$$.fragment, local);
    			transition_in(menudropdownitem5.$$.fragment, local);
    			transition_in(menudropdownitem6.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(menudropdownitem0.$$.fragment, local);
    			transition_out(menudropdownitem1.$$.fragment, local);
    			transition_out(menudropdownitem2.$$.fragment, local);
    			transition_out(menudropdownitem3.$$.fragment, local);
    			transition_out(menudropdownitem4.$$.fragment, local);
    			transition_out(menudropdownitem5.$$.fragment, local);
    			transition_out(menudropdownitem6.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			destroy_component(menudropdownitem0, detaching);
    			if (detaching) detach(t0);
    			destroy_component(menudropdownitem1, detaching);
    			if (detaching) detach(t1);
    			destroy_component(menudropdownitem2, detaching);
    			if (detaching) detach(t2);
    			destroy_component(menudropdownitem3, detaching);
    			if (detaching) detach(t3);
    			destroy_component(menudropdownitem4, detaching);
    			if (detaching) detach(t4);
    			destroy_component(menudropdownitem5, detaching);
    			if (detaching) detach(t5);
    			destroy_component(menudropdownitem6, detaching);
    		}
    	};
    }

    // (46:8) <MenuItem text="Right" dropdown>
    function create_default_slot_8(ctx) {
    	let current;

    	const menudropdown = new Menu_dropdown({
    			props: {
    				right: true,
    				$$slots: { default: [create_default_slot_9] },
    				$$scope: { ctx }
    			}
    		});

    	return {
    		c() {
    			create_component(menudropdown.$$.fragment);
    		},
    		m(target, anchor) {
    			mount_component(menudropdown, target, anchor);
    			current = true;
    		},
    		p(ctx, dirty) {
    			const menudropdown_changes = {};

    			if (dirty & /*$$scope*/ 1) {
    				menudropdown_changes.$$scope = { dirty, ctx };
    			}

    			menudropdown.$set(menudropdown_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(menudropdown.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(menudropdown.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			destroy_component(menudropdown, detaching);
    		}
    	};
    }

    // (60:12) <MenuDropdownItem href="#">
    function create_default_slot_7(ctx) {
    	let span;
    	let t1;
    	let current;

    	const icon = new Icon({
    			props: {
    				class: "margin-left",
    				f7: "logo_facebook"
    			}
    		});

    	return {
    		c() {
    			span = element("span");
    			span.textContent = "Share on Facebook";
    			t1 = space();
    			create_component(icon.$$.fragment);
    		},
    		m(target, anchor) {
    			insert(target, span, anchor);
    			insert(target, t1, anchor);
    			mount_component(icon, target, anchor);
    			current = true;
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
    			if (detaching) detach(span);
    			if (detaching) detach(t1);
    			destroy_component(icon, detaching);
    		}
    	};
    }

    // (64:12) <MenuDropdownItem href="#">
    function create_default_slot_6(ctx) {
    	let span;
    	let t1;
    	let current;

    	const icon = new Icon({
    			props: { class: "margin-left", f7: "logo_twitter" }
    		});

    	return {
    		c() {
    			span = element("span");
    			span.textContent = "Share on Twitter";
    			t1 = space();
    			create_component(icon.$$.fragment);
    		},
    		m(target, anchor) {
    			insert(target, span, anchor);
    			insert(target, t1, anchor);
    			mount_component(icon, target, anchor);
    			current = true;
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
    			if (detaching) detach(span);
    			if (detaching) detach(t1);
    			destroy_component(icon, detaching);
    		}
    	};
    }

    // (59:10) <MenuDropdown right>
    function create_default_slot_5(ctx) {
    	let t;
    	let current;

    	const menudropdownitem0 = new Menu_dropdown_item({
    			props: {
    				href: "#",
    				$$slots: { default: [create_default_slot_7] },
    				$$scope: { ctx }
    			}
    		});

    	const menudropdownitem1 = new Menu_dropdown_item({
    			props: {
    				href: "#",
    				$$slots: { default: [create_default_slot_6] },
    				$$scope: { ctx }
    			}
    		});

    	return {
    		c() {
    			create_component(menudropdownitem0.$$.fragment);
    			t = space();
    			create_component(menudropdownitem1.$$.fragment);
    		},
    		m(target, anchor) {
    			mount_component(menudropdownitem0, target, anchor);
    			insert(target, t, anchor);
    			mount_component(menudropdownitem1, target, anchor);
    			current = true;
    		},
    		p(ctx, dirty) {
    			const menudropdownitem0_changes = {};

    			if (dirty & /*$$scope*/ 1) {
    				menudropdownitem0_changes.$$scope = { dirty, ctx };
    			}

    			menudropdownitem0.$set(menudropdownitem0_changes);
    			const menudropdownitem1_changes = {};

    			if (dirty & /*$$scope*/ 1) {
    				menudropdownitem1_changes.$$scope = { dirty, ctx };
    			}

    			menudropdownitem1.$set(menudropdownitem1_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(menudropdownitem0.$$.fragment, local);
    			transition_in(menudropdownitem1.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(menudropdownitem0.$$.fragment, local);
    			transition_out(menudropdownitem1.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			destroy_component(menudropdownitem0, detaching);
    			if (detaching) detach(t);
    			destroy_component(menudropdownitem1, detaching);
    		}
    	};
    }

    // (58:8) <MenuItem style="margin-left: auto" iconF7="square_arrow_up" dropdown>
    function create_default_slot_4(ctx) {
    	let current;

    	const menudropdown = new Menu_dropdown({
    			props: {
    				right: true,
    				$$slots: { default: [create_default_slot_5] },
    				$$scope: { ctx }
    			}
    		});

    	return {
    		c() {
    			create_component(menudropdown.$$.fragment);
    		},
    		m(target, anchor) {
    			mount_component(menudropdown, target, anchor);
    			current = true;
    		},
    		p(ctx, dirty) {
    			const menudropdown_changes = {};

    			if (dirty & /*$$scope*/ 1) {
    				menudropdown_changes.$$scope = { dirty, ctx };
    			}

    			menudropdown.$set(menudropdown_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(menudropdown.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(menudropdown.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			destroy_component(menudropdown, detaching);
    		}
    	};
    }

    // (16:6) <Menu>
    function create_default_slot_3(ctx) {
    	let t0;
    	let t1;
    	let t2;
    	let t3;
    	let current;

    	const menuitem0 = new Menu_item({
    			props: {
    				text: "Left",
    				dropdown: true,
    				$$slots: { default: [create_default_slot_12] },
    				$$scope: { ctx }
    			}
    		});

    	const menuitem1 = new Menu_item({
    			props: {
    				text: "Center",
    				dropdown: true,
    				$$slots: { default: [create_default_slot_10] },
    				$$scope: { ctx }
    			}
    		});

    	const menuitem2 = new Menu_item({
    			props: {
    				text: "Right",
    				dropdown: true,
    				$$slots: { default: [create_default_slot_8] },
    				$$scope: { ctx }
    			}
    		});

    	const menuitem3 = new Menu_item({
    			props: {
    				style: "margin-left: auto",
    				iconF7: "square_arrow_up",
    				dropdown: true,
    				$$slots: { default: [create_default_slot_4] },
    				$$scope: { ctx }
    			}
    		});

    	const menuitem4 = new Menu_item({ props: { href: "#", iconF7: "pencil" } });

    	return {
    		c() {
    			create_component(menuitem0.$$.fragment);
    			t0 = space();
    			create_component(menuitem1.$$.fragment);
    			t1 = space();
    			create_component(menuitem2.$$.fragment);
    			t2 = space();
    			create_component(menuitem3.$$.fragment);
    			t3 = space();
    			create_component(menuitem4.$$.fragment);
    		},
    		m(target, anchor) {
    			mount_component(menuitem0, target, anchor);
    			insert(target, t0, anchor);
    			mount_component(menuitem1, target, anchor);
    			insert(target, t1, anchor);
    			mount_component(menuitem2, target, anchor);
    			insert(target, t2, anchor);
    			mount_component(menuitem3, target, anchor);
    			insert(target, t3, anchor);
    			mount_component(menuitem4, target, anchor);
    			current = true;
    		},
    		p(ctx, dirty) {
    			const menuitem0_changes = {};

    			if (dirty & /*$$scope*/ 1) {
    				menuitem0_changes.$$scope = { dirty, ctx };
    			}

    			menuitem0.$set(menuitem0_changes);
    			const menuitem1_changes = {};

    			if (dirty & /*$$scope*/ 1) {
    				menuitem1_changes.$$scope = { dirty, ctx };
    			}

    			menuitem1.$set(menuitem1_changes);
    			const menuitem2_changes = {};

    			if (dirty & /*$$scope*/ 1) {
    				menuitem2_changes.$$scope = { dirty, ctx };
    			}

    			menuitem2.$set(menuitem2_changes);
    			const menuitem3_changes = {};

    			if (dirty & /*$$scope*/ 1) {
    				menuitem3_changes.$$scope = { dirty, ctx };
    			}

    			menuitem3.$set(menuitem3_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(menuitem0.$$.fragment, local);
    			transition_in(menuitem1.$$.fragment, local);
    			transition_in(menuitem2.$$.fragment, local);
    			transition_in(menuitem3.$$.fragment, local);
    			transition_in(menuitem4.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(menuitem0.$$.fragment, local);
    			transition_out(menuitem1.$$.fragment, local);
    			transition_out(menuitem2.$$.fragment, local);
    			transition_out(menuitem3.$$.fragment, local);
    			transition_out(menuitem4.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			destroy_component(menuitem0, detaching);
    			if (detaching) detach(t0);
    			destroy_component(menuitem1, detaching);
    			if (detaching) detach(t1);
    			destroy_component(menuitem2, detaching);
    			if (detaching) detach(t2);
    			destroy_component(menuitem3, detaching);
    			if (detaching) detach(t3);
    			destroy_component(menuitem4, detaching);
    		}
    	};
    }

    // (4:4) <Page>
    function create_default_slot_2$2(ctx) {
    	let t0;
    	let t1;
    	let t2;
    	let t3;
    	let current;
    	const navbar = new Navbar({ props: { title: "Menu" } });

    	const blocktitle0 = new Block_title({
    			props: {
    				$$slots: { default: [create_default_slot_16] },
    				$$scope: { ctx }
    			}
    		});

    	const menu0 = new Menu({
    			props: {
    				$$slots: { default: [create_default_slot_15] },
    				$$scope: { ctx }
    			}
    		});

    	const blocktitle1 = new Block_title({
    			props: {
    				$$slots: { default: [create_default_slot_14] },
    				$$scope: { ctx }
    			}
    		});

    	const menu1 = new Menu({
    			props: {
    				$$slots: { default: [create_default_slot_3] },
    				$$scope: { ctx }
    			}
    		});

    	return {
    		c() {
    			create_component(navbar.$$.fragment);
    			t0 = space();
    			create_component(blocktitle0.$$.fragment);
    			t1 = space();
    			create_component(menu0.$$.fragment);
    			t2 = space();
    			create_component(blocktitle1.$$.fragment);
    			t3 = space();
    			create_component(menu1.$$.fragment);
    		},
    		m(target, anchor) {
    			mount_component(navbar, target, anchor);
    			insert(target, t0, anchor);
    			mount_component(blocktitle0, target, anchor);
    			insert(target, t1, anchor);
    			mount_component(menu0, target, anchor);
    			insert(target, t2, anchor);
    			mount_component(blocktitle1, target, anchor);
    			insert(target, t3, anchor);
    			mount_component(menu1, target, anchor);
    			current = true;
    		},
    		p(ctx, dirty) {
    			const blocktitle0_changes = {};

    			if (dirty & /*$$scope*/ 1) {
    				blocktitle0_changes.$$scope = { dirty, ctx };
    			}

    			blocktitle0.$set(blocktitle0_changes);
    			const menu0_changes = {};

    			if (dirty & /*$$scope*/ 1) {
    				menu0_changes.$$scope = { dirty, ctx };
    			}

    			menu0.$set(menu0_changes);
    			const blocktitle1_changes = {};

    			if (dirty & /*$$scope*/ 1) {
    				blocktitle1_changes.$$scope = { dirty, ctx };
    			}

    			blocktitle1.$set(blocktitle1_changes);
    			const menu1_changes = {};

    			if (dirty & /*$$scope*/ 1) {
    				menu1_changes.$$scope = { dirty, ctx };
    			}

    			menu1.$set(menu1_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(navbar.$$.fragment, local);
    			transition_in(blocktitle0.$$.fragment, local);
    			transition_in(menu0.$$.fragment, local);
    			transition_in(blocktitle1.$$.fragment, local);
    			transition_in(menu1.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(navbar.$$.fragment, local);
    			transition_out(blocktitle0.$$.fragment, local);
    			transition_out(menu0.$$.fragment, local);
    			transition_out(blocktitle1.$$.fragment, local);
    			transition_out(menu1.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			destroy_component(navbar, detaching);
    			if (detaching) detach(t0);
    			destroy_component(blocktitle0, detaching);
    			if (detaching) detach(t1);
    			destroy_component(menu0, detaching);
    			if (detaching) detach(t2);
    			destroy_component(blocktitle1, detaching);
    			if (detaching) detach(t3);
    			destroy_component(menu1, detaching);
    		}
    	};
    }

    // (3:2) <View main>
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
    function create_default_slot$3(ctx) {
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

    function create_fragment$i(ctx) {
    	let current;

    	const app = new App({
    			props: {
    				$$slots: { default: [create_default_slot$3] },
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

    class Menu_1 extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, null, create_fragment$i, safe_not_equal, {});
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
    const app = new Menu_1({
      target: document.getElementById('app'),
    });

    return app;

})));
