"use strict";

var special_char              = '~',
    safe_special_char         = '\\x7e',
    escaped_safe_special_char = '\\' + safe_special_char,
    special_char_rg           = RegExp(safe_special_char, 'g'),
    safe_special_char_rg      = RegExp(escaped_safe_special_char, 'g'),
    get_regex                 = /^\/(.*)\/(.*)/,
    undriers                  = {},
    driers                    = {};

/**
 * Generate a replacer function
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.1.0
 * @version  1.0.1
 *
 * @param    {Object}   root
 * @param    {Function} replacer
 *
 * @return   {Function}
 */
function createDryReplacer(root, replacer) {

	var value_paths = new WeakMap(),
	    seen_path,
	    flags = {is_root: true},
	    chain = [],
	    path = [],
	    temp,
	    last,
	    len;

	return function dryReplacer(holder, key, value) {

		// Process the value to a possible given replacer function
		if (replacer != null) {
			value = replacer.call(holder, key, value);
		}

		// All falsy values can be returned as-is
		if (!value) {
			return value;
		}

		let is_wrap;

		// An explicitly false key means this dryReplaced was
		// recursively called with a replacement object
		if (key === false) {
			key = '';
			is_wrap = true;

			// Wrappers get added to the object chain, but not the path
			// We need to be able to identify them later on
			holder.__is_wrap = true;

			// See if the wrapped value is an object
			if (holder[''] != null && typeof holder[''] === 'object') {
				holder.__is_object = true;
			}
		}

		switch (typeof value) {

			case 'function':
				// If no drier is created, return now.
				// Else: fall through
				if (!driers.Function) {
					return;
				}

			case 'object':
				value = replaceObject(dryReplacer, value, chain, flags, is_wrap, holder, path, value_paths, key);
				break;

			case 'string':
				// Make sure regular strings don't start with the path delimiter
				if (!flags.is_root && value[0] == '~') {
					value = safe_special_char + value.slice(1);
				}

				break;

			case 'number':
				// Allow infinite values
				if (value && !isFinite(value)) {
					if (value > 0) {
						value = {dry: '+Infinity'};
					} else {
						value = {dry: '-Infinity'};
					}
				}
				break;
		}

		return value;
	}
}

/**
 * Actually replace the object
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.1.0
 * @version  1.0.11
 */
function replaceObject(dryReplacer, value, chain, flags, is_wrap, holder, path, value_paths, key) {

	var class_name,
	    seen_path,
	    new_value,
	    replaced,
	    is_array,
	    keys,
	    last,
	    temp,
	    len,
	    i;

	if (typeof value.constructor == 'function') {
		class_name = value.constructor.name;
	} else {
		class_name = 'Object';
	}

	// See if the chain needs popping
	while (len = chain.length) {

		// If the current object at the end of the chain does not
		// match the current holder, move one up
		// Don't mess with the chain if this is a wrap object
		if (!is_wrap && holder !== chain[len-1]) {

			last = chain.pop();

			// Only pop the path if the popped object isn't a wrapper
			if (last && !last.__is_wrap) {
				path.pop();
			}
		} else {
			break;
		}
	}

	// Has the object been seen before?
	seen_path = value_paths.get(value);

	if (seen_path) {

		// If the path is still an array,
		// turn it into a string now
		if (typeof seen_path != 'string') {

			// First iterate over the pieces and escape them
			for (i = 0; i < seen_path.length; i++) {
				if (seen_path[i].indexOf(special_char) > -1) {
					seen_path[i] = seen_path[i].replace(special_char_rg, safe_special_char);
				}
			}

			seen_path = special_char + seen_path.join(special_char);
			value_paths.set(value, seen_path);
		}

		// Replace the value with the path
		new_value = seen_path;

		// See if the new path is shorter
		len = 1;
		for (i = 0; i < path.length; i++) {
			len += 1 + path[i].length;
		}
		len += key.length;

		if (len < seen_path.length) {
			temp = seen_path;
			seen_path = path.slice(0);

			// The key of the current value still needs to be added
			seen_path.push(key);

			// First iterate over the pieces and escape them
			for (i = 0; i < seen_path.length; i++) {
				if (seen_path[i].indexOf(special_char) > -1) {
					seen_path[i] = seen_path[i].replace(special_char_rg, safe_special_char);
				}
			}

			seen_path = special_char + seen_path.join(special_char);
			value_paths.set(value, seen_path);

			// This entry still has to refer to the longer path,
			// otherwise it'll refer to itself
			seen_path = temp;
		}

		value = new_value;

		return value;
	}

	if (!flags.is_root && !is_wrap) {
		path.push(key);
	} else {
		flags.is_root = false;
	}

	// Make a copy of the current path array
	value_paths.set(value, path.slice(0));

	if (driers[class_name] != null) {
		value = driers[class_name].fnc(holder, key, value);

		value = {
			dry: class_name,
			value: value
		};

		if (driers[class_name].options.add_path !== false) {
			value.drypath = path.slice(0);
		}

		replaced = {'': value};
	} else if (class_name === 'RegExp' && value.constructor == RegExp) {
		value = {dry: 'regexp', value: value.toString()};
		replaced = {'': value};
	} else if (class_name === 'Date' && value.constructor == Date) {
		value = {dry: 'date', value: value.toISOString()};
		replaced = {'': value};
	} else if (typeof value.toDry === 'function') {
		temp = value;
		value = value.toDry();

		// If no path was supplied in the toDry,
		// get some more class information
		if (!value.path) {
			if (temp.constructor) {
				if (!value.namespace && temp.constructor.namespace) {
					value.namespace = temp.constructor.namespace;
				}

				if (!value.dry_class) {
					value.dry_class = temp.constructor.name;
				}
			}
		}

		value.dry = 'toDry';
		value.drypath = path.slice(0);
		replaced = {'': value};
	} else if (typeof value.toJSON === 'function') {
		value = value.toJSON();
		replaced = {'': value};
	} else {
		is_array = Array.isArray(value);
	}

	if (replaced) {
		// Push the replaced object on the chain
		chain.push(replaced);

		// Jsonify the replaced object
		value = dryReplacer(replaced, false, replaced['']);

		// At least one part of the path & chain will have
		// to be popped off. This is needed for toJSON calls
		// that return primitive values
		temp = chain.pop();

		// Don't pop off anything from the path if the last item
		// from the chain was a wrapper for an object,
		// because then it'll already be popped of
		if (!(temp && temp.__is_wrap && temp.__is_object)) {
			path.pop();
		}

		// Break out of the switch
		return value;
	}

	// Push this object on the chain
	chain.push(value);

	if (is_array) {
		new_value = [];

		for (i = 0; i < value.length; i++) {
			new_value[i] = dryReplacer(value, String(i), value[i]);
		}
	} else {
		new_value = recurseGeneralObject(dryReplacer, value);
	}

	value = new_value;

	return value;
}

/**
 * Recursively replace the given regular object
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    1.0.11
 * @version  1.0.11
 *
 * @param    {Function}   dryReplacer
 * @param    {Object}     value
 *
 * @return   {Object}
 */
function recurseGeneralObject(dryReplacer, value) {

	var new_value = {},
	    keys = Object.keys(value),
	    key,
	    i;

	for (i = 0; i < keys.length; i++) {
		key = keys[i];
		new_value[key] = dryReplacer(value, key, value[key]);
	}

	return new_value;
}

/**
 * Generate reviver function
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.1.0
 * @version  1.0.2
 *
 * @param    {Function}   reviver
 * @param    {Map}        undry_paths
 *
 * @return   {Function}
 */
function generateReviver(reviver, undry_paths) {

	return function dryReviver(key, value) {

		var val_type = typeof value,
		    constructor,
		    temp;

		if (val_type === 'string') {
			if (value[0] === special_char) {
				// This is actually a path that needs to be replaced.
				// Put in a String object for now
				return new String(value.slice(1));
			} else if (value[0] == '\\' && value[1] == 'x' && value[2] == '7' && value[3] == 'e') {
				value = special_char + value.slice(4);
			}
		} else if (value && value.dry != null) {

			switch (value.dry) {

				case 'date':
					if (value.value) {
						return new Date(value.value);
					}
					break;

				case 'regexp':
					if (value.value) {
						return RegExp.apply(undefined, get_regex.exec(value.value).slice(1));
					}
					break;

				case '+Infinity':
					return Infinity;

				case '-Infinity':
					return -Infinity;

				case 'toDry':
					constructor = findClass(value);

					// Undry this element, but don't put it in the parsed object yet
					if (constructor && typeof constructor.unDry === 'function') {
						value.unDryConstructor = constructor;
					} else {
						value.undried = value.value;
					}

					if (value.drypath) {
						undry_paths.set(value.drypath.join(special_char), value);
					} else {
						return value.undried;
					}
					break;

				default:
					if (typeof value.value !== 'undefined') {
						if (undriers[value.dry]) {
							value.unDryFunction = undriers[value.dry].fnc;

							if (!value.drypath) {
								// No path given? Then do the undrying right now
								value.undried = value.unDryFunction(this, key, value.value)
							}

						} else {
							value.undried = value.value;
						}

						if (value.drypath) {
							undry_paths.set(value.drypath.join(special_char), value);
						} else {
							return value.undried;
						}
					}
			}
		}

		if (reviver == null) {
			return value;
		}

		return reviver.call(this, key, value);
	};
};

/**
 * Deep clone an object
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    1.0.0
 * @version  1.0.10
 *
 * @param    {Object}   obj
 * @param    {String}   custom_method   Custom method to use if available
 * @param    {Array}    extra_args      Extra arguments for the custom method
 * @param    {WeakMap}  wm
 *
 * @return   {Object}
 */
function clone(obj, custom_method, extra_args, wm) {

	if (custom_method instanceof WeakMap) {
		wm = custom_method;
		custom_method = null;
	} else if (extra_args instanceof WeakMap) {
		wm = extra_args;
		extra_args = null;
	}

	if (!wm) {
		wm = new WeakMap();
		wm.source = obj;
		wm.custom_method = custom_method;
		wm.extra_args = extra_args;
	} else if (wm.has(obj)) {
		return wm.get(obj);
	}

	if (custom_method) {
		extra_args = [wm].concat(extra_args);
	}

	return real_clone({'_': obj}, custom_method, extra_args, wm)['_'];
}

/**
 * Deep clone an object
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    1.0.0
 * @version  1.0.10
 *
 * @param    {Object}   obj
 * @param    {String}   custom_method   Custom method to use if available
 * @param    {Array}    extra_args      Extra arguments for the custom method
 * @param    {WeakMap}  wm
 *
 * @return   {Object}
 */
function real_clone(obj, custom_method, extra_args, wm) {

	var entry_type,
	    name_type,
	    target,
	    entry,
	    split,
	    keys,
	    temp,
	    key,
	    len,
	    i;

	if (Array.isArray(obj)) {
		target = [];
	} else {
		target = {};
	}

	keys = Object.keys(obj);
	len = keys.length;

	// Remember the root object and its clone
	wm.set(obj, target);

	for (i = 0; i < len; i++) {
		key = keys[i];
		entry = obj[key];
		entry_type = typeof entry;

		if (entry && (entry_type == 'object' || entry_type == 'function')) {

			if (entry_type == 'function' && !driers.Function) {
				continue;
			}

			// If this has been cloned before, use that
			if (wm.has(entry)) {
				target[key] = wm.get(entry);
				continue;
			}

			if (entry.constructor) {
				name_type = entry.constructor.name;

				if (custom_method && entry[custom_method]) {
					target[key] = entry[custom_method].apply(entry, extra_args);
				} else if (driers[name_type] != null) {
					// Look for a registered drier function
					temp = driers[name_type].fnc(obj, key, entry);

					if (undriers[name_type]) {
						target[key] = undriers[name_type].fnc(target, key, temp);
					} else {
						target[key] = temp;
					}
				} else if (entry.dryClone) {
					// Look for dryClone after
					target[key] = entry.dryClone(wm, custom_method);
				} else if (entry.toDry) {
					// Perform the toDry function
					temp = entry.toDry();

					// Clone the value,
					// because returned objects aren't necesarilly cloned yet
					temp = real_clone(temp, custom_method, extra_args, wm).value;

					// Perform the undry function
					if (entry.constructor.unDry) {
						target[key] = entry.constructor.unDry(temp, custom_method || true);
					} else {
						// If there is no undry function, the clone will be a simple object
						target[key] = temp;
					}
				} else if (name_type == 'Date') {
					target[key] = new Date(entry);
				} else if (name_type == 'RegExp') {
					temp = entry.toString();
					split = temp.match(/^\/(.*?)\/([gim]*)$/);

					if (split) {
						target[key] = RegExp(split[1], split[2]);
					} else {
						target[key] = RegExp(temp);
					}
				} else if (typeof entry.clone == 'function') {
					// If it supplies a clone method, use that
					target[key] = entry.clone();
				} else if (entry.toJSON) {
					temp = entry.toJSON();

					if (temp && typeof temp == 'object') {
						temp = real_clone(temp, custom_method, extra_args, wm);
					}

					target[key] = temp;
				} else {
					target[key] = real_clone(entry, custom_method, extra_args, wm);
				}
			} else {
				target[key] = real_clone(entry, custom_method, extra_args, wm);
			}

			// Remember this clone for later
			wm.set(entry, target[key]);
		} else {
			target[key] = entry;
		}
	}

	return target;
}

/**
 * Register a drier
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    1.0.0
 * @version  1.0.0
 *
 * @param    {Function|String}   constructor   What constructor to listen to
 * @param    {Function} fnc
 * @param    {Object}   options
 */
function registerDrier(constructor, fnc, options) {

	var path;

	if (typeof constructor == 'function') {
		path = constructor.name;
	} else {
		path = constructor;
	}

	driers[path] = {
		fnc     : fnc,
		options : options || {}
	};
}

/**
 * Register an undrier
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    1.0.0
 * @version  1.0.0
 *
 * @param    {Function|String}   constructor   What constructor to listen to
 * @param    {Function} fnc
 * @param    {Object}   options
 */
function registerUndrier(constructor, fnc, options) {

	var path;

	if (typeof constructor == 'function') {
		path = constructor.name;
	} else {
		path = constructor;
	}

	undriers[path] = {
		fnc     : fnc,
		options : options || {}
	};
}

/**
 * Register a class that can be serialized/revived
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    1.0.0
 * @version  1.0.5
 *
 * @param    {String}            name          The optional name of the class
 * @param    {Function|String}   constructor   What constructor to listen to
 */
function registerClass(name, constructor) {

	var context = exports.Classes;

	if (typeof name == 'function') {
		constructor = name;
		name = constructor.name;
	}

	if (constructor.namespace) {
		context = fromPath(exports.Classes, constructor.namespace);

		if (!context) {
			context = {};
			setPath(exports.Classes, constructor.namespace.split('.'), context);
		}
	}

	context[name] = constructor;
}

/**
 * Find a class
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    1.0.0
 * @version  1.0.9
 *
 * @param    {String}   value   The name of the class
 */
function findClass(value) {

	var constructor,
	    ns;

	// Return nothing for falsy values
	if (!value) {
		return null;
	}

	// Look for a regular class when it's just a string
	if (typeof value == 'string') {

		if (exports.Classes[value]) {
			return exports.Classes[value];
		}

		return null;
	}

	if (value.path) {
		return fromPath(exports.Classes, value.path);
	} else {
		if (value.namespace) {
			ns = fromPath(exports.Classes, value.namespace);
		} else {
			ns = exports.Classes;
		}

		if (value.dry_class) {
			constructor = fromPath(ns, value.dry_class);
		} else if (value.name) {
			constructor = ns[value.name];
		}

		if (!constructor && ns) {
			if (ns.main_class) {
				ns = ns.main_class;
			}

			if (ns && typeof ns.getClassForUndry == 'function') {
				constructor = ns.getClassForUndry(value.dry_class || value.name);
			}
		}
	}

	if (!constructor) {
		console.log('Could not find constructor for', value);
	}

	return constructor;
}

/**
 * Regenerate an array
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.1.4
 * @version  1.0.8
 *
 * @return   {Array}
 */
function regenerateArray(root, holder, current, seen, retrieve, undry_paths, old, current_path) {

	var length = current.length,
	    temp,
	    i;

	for (i = 0; i < length; i++) {
		// Only regenerate if it's not yet seen
		if (!seen.get(current[i])) {

			temp = current_path.slice(0);
			temp.push(i);

			current[i] = regenerate(root, current, current[i], seen, retrieve, undry_paths, old, temp);
		}
	}

	return current;
};

/**
 * Regenerate an object
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.1.4
 * @version  1.0.11
 *
 * @return   {Object}
 */
function regenerateObject(root, holder, current, seen, retrieve, undry_paths, old, current_path) {

	var path,
	    temp,
	    key;

	for (key in current) {
		if (current.hasOwnProperty(key)) {
			// Only regenerate if it's not already seen
			if (!seen.get(current[key])) {
				path = current_path.slice(0);
				path.push(key);

				temp = regenerate(root, current, current[key], seen, retrieve, undry_paths, old, path);

				// @TODO: Values returned by `unDry` methods also get regenerated,
				// even though these could contain properties coming from somewhere else,
				// like live HTMLCollections. Assigning anything to that will throw an error.
				// This is a workaround to that proble: if the value is exactly the same,
				// it's not needed to assign it again, so it won't throw an error,
				// but it's not an ideal solution.
				if (temp !== current[key]) {
					current[key] = temp;
				}
			}
		}
	}

	return current;
};

/**
 * Regenerate a value
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.1.4
 * @version  1.0.8
 *
 * @return   {Mixed}
 */
function regenerate(root, holder, current, seen, retrieve, undry_paths, old, current_path) {

	var temp;

	if (current && typeof current == 'object') {
		// Remember this object has been regenerated already
		seen.set(current, true);

		if (current instanceof Array) {
			return regenerateArray(root, holder, current, seen, retrieve, undry_paths, old, current_path);
		}

		if (current instanceof String) {

			if (current.length > -1) {
				current = current.toString();

				if (temp = undry_paths.get(current)) {
					if (typeof temp.undried != 'undefined') {
						return temp.undried;
					}

					if (!holder) {
						throw new Error('Unable to resolve recursive reference');
					}

					undry_paths.extra_pass.push([holder, temp, current_path]);

					return temp;
				}

				if (retrieve.hasOwnProperty(current)) {
					temp = retrieve[current];
				} else {
					temp = retrieve[current] = retrieveFromPath(root, current.split(special_char));

					if (typeof temp == 'undefined') {
						temp = retrieve[current] = getFromOld(old, current.split(special_char));
					}
				}

				// Because we always regenerate parsed objects first
				// (JSON-dry parsing goes from string » object » regenerated object)
				// keys of regular objects can appear out-of-order, so we need to parse them
				if (temp && temp instanceof String) {
					// Unset the String as a valid result
					retrieve[current] = null;

					// Regenerate the string again
					// (We have to create a new instance, because it's already been "seen")
					temp = retrieve[current] = regenerate(root, holder, new String(temp), seen, retrieve, undry_paths, old, current_path);
				}

				return temp;
			} else {
				return root;
			}
		}

		return regenerateObject(root, holder, current, seen, retrieve, undry_paths, old, current_path);
	}

	return current;
};

/**
 * Find path in an "old" object
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    1.0.10
 * @version  1.0.10
 *
 * @param    {Object}   old      The object to look in
 * @param    {Array}    pieces   The path to look for
 *
 * @return   {Mixed}
 */
function getFromOld(old, pieces) {

	var length = pieces.length,
	    result,
	    path,
	    rest,
	    i;

	for (i = 0; i < length; i++) {
		path = pieces.slice(0, length - i).join('.');

		result = old[path];

		if (typeof result != 'undefined') {

			if (i == 0) {
				return result;
			}

			rest = pieces.slice(pieces.length - i);

			result = retrieveFromPath(result, rest);

			if (typeof result != 'undefined') {
				return result;
			}
		}
	}
}

/**
 * Retrieve from path.
 * Set the given value, but only if the containing object exists.
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.1.4
 * @version  1.0.10
 *
 * @param    {Object}   current   The object to look in
 * @param    {Array}    keys      The path to look for
 * @param    {Mixed}    value     Optional value to set
 *
 * @return   {Mixed}
 */
function retrieveFromPath(current, keys) {

	var length = keys.length,
	    prev,
	    key,
	    i;

	// Keys [''] always means the root
	if (length == 1 && keys[0] === '') {
		return current;
	}

	for (i = 0; i < length; i++) {
		key = keys[i];

		// Normalize the key
		if (typeof key == 'number') {
			// Allow
		} else if (key.indexOf(safe_special_char) > -1) {
			key = key.replace(safe_special_char_rg, special_char);
		}

		prev = current;

		if (current) {
			if (current.hasOwnProperty(key)) {
				current = current[key];
			} else {
				return undefined;
			}
		} else {
			return undefined;
		}
	}

	return current;
}

/**
 * Extract something from an object by the path
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.1.0
 * @version  1.0.0
 *
 * @param    {Object}    obj
 * @param    {String}    path
 *
 * @return   {Mixed}
 */
function fromPath(obj, path) {

	var pieces,
	    here,
	    len,
	    i;

	if (typeof path == 'string') {
		pieces = path.split('.');
	} else {
		pieces = path;
	}

	here = obj;

	// Go over every piece in the path
	for (i = 0; i < pieces.length; i++) {
		if (here != null) {
			if (here.hasOwnProperty(pieces[i])) {
				here = here[pieces[i]];
			} else {
				return null;
			}
		} else {
			break;
		}
	}

	return here;
}

/**
 * Set something on the given path
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    1.0.0
 * @version  1.0.2
 *
 * @param    {Object}    obj
 * @param    {Array}     path
 * @param    {Boolean}   force   If a piece of the path doesn't exist, create it
 *
 * @return   {Mixed}
 */
function setPath(obj, keys, value, force) {

	var here,
	    i;

	here = obj;

	for (i = 0; i < keys.length - 1; i++) {

		if (here != null) {
			if (here.hasOwnProperty(keys[i])) {
				here = here[keys[i]];
			} else {
				if (force && here[keys[i]] == null) {
					here[keys[i]] = {};
					here = here[keys[i]];
					continue;
				}

				return null;
			}
		}
	}

	here[keys[keys.length - 1]] = value;
}

/**
 * Convert an object to a DRY object, ready for stringifying
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    1.0.0
 * @version  1.0.0
 *
 * @param    {Object}   value
 * @param    {Function} replacer
 *
 * @return   {Object}
 */
function toDryObject(value, replacer) {
	var root = {'': value};
	return createDryReplacer(root, replacer)(root, '', value);
}

/**
 * Convert directly to a string
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    1.0.0
 * @version  1.0.0
 *
 * @param    {Object}   value
 * @param    {Function} replacer
 *
 * @return   {Object}
 */
function stringify(value, replacer, space) {
	return JSON.stringify(toDryObject(value, replacer), null, space);
}

/**
 * Map an object
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.4.2
 * @version  1.0.0
 *
 * @param    {Object}     obj     The object to walk over
 * @param    {Function}   fnc     The function to perform on every entry
 * @param    {Object}     result  The object to add to
 *
 * @return   {Object}
 */
function walk(obj, fnc, result) {

	var is_root,
	    keys,
	    key,
	    ret,
	    i;

	if (!result) {
		is_root = true;

		if (Array.isArray(obj)) {
			result = [];
		} else {
			result = {};
		}
	}

	keys = Object.keys(obj);

	for (i = 0; i < keys.length; i++) {
		key = keys[i];

		if (typeof obj[key] == 'object' && obj[key] != null) {
			if (Array.isArray(obj[key])) {
				result[key] = walk(obj[key], fnc, []);
			} else {
				result[key] = walk(obj[key], fnc, {});
			}
			result[key] = fnc(key, result[key], result);
		} else {
			// Fire the function
			result[key] = fnc(key, obj[key], obj);
		}
	}

	if (is_root) {
		result = fnc('', result);
	}

	return result;
}

/**
 * Convert from a dried object
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    1.0.0
 * @version  1.0.4
 *
 * @param    {Object}   value
 *
 * @return   {Object}
 */
function parse(object, reviver) {

	var undry_paths = new Map(),
	    retrieve    = {},
	    reviver,
	    result,
	    holder,
	    entry,
	    temp,
	    seen,
	    path,
	    key,
	    old = {};

	// Create the reviver function
	reviver = generateReviver(reviver, undry_paths);

	if (typeof object == 'string') {
		object = JSON.parse(object);
	}

	if (!object || typeof object != 'object') {
		return object;
	}

	result = walk(object, reviver);

	if (result == null) {
		return result;
	}

	// To remember which objects have already been revived
	seen = new WeakMap();

	// Maybe paths need another round of undrying
	undry_paths.extra_pass = [];

	// Iterate over all the values that require some kind of function to be revived
	undry_paths.forEach(function eachEntry(entry, path) {

		var path_array = entry.drypath,
		    path_string = path_array.join('.');

		// Regenerate this replacement wrapper first
		regenerate(result, null, entry, seen, retrieve, undry_paths, old, path_array.slice(0));

		if (entry.unDryConstructor) {
			entry.undried = entry.unDryConstructor.unDry(entry.value, false);
		} else if (entry.unDryFunction) {
			entry.undried = entry.unDryFunction(entry, null, entry.value);
		} else {
			entry.undried = entry.value;
		}

		// Remember the old wrapper entry, some other references
		// may still point to it's children
		old[path_string] = entry;

		if (entry.drypath && entry.drypath.length) {
			setPath(result, entry.drypath, entry.undried);
		}
	});

	for (var i = 0; i < undry_paths.extra_pass.length; i++) {
		entry = undry_paths.extra_pass[i];
		holder = entry[0];
		temp = entry[1];
		path = entry[2];

		for (key in holder) {
			if (holder[key] == temp) {
				holder[key] = temp.undried;
				break;
			}
		}

		path.pop();

		// Annoying workaround for some circular references
		if (path.length && path[path.length - 1] == 'value') {
			path.pop();
		}

		if (path.length) {

			// Get the other holder
			holder = retrieveFromPath(result, path);

			// If the holder object was not found in the result,
			// it was probably a child of ANOTHER holder that has already been undried & replaces
			// Just get the value from the object containing old references
			if (!holder) {
				holder = getFromOld(old, path);
			}

			for (key in holder) {
				if (holder[key] == temp) {
					holder[key] = temp.undried;
					break;
				}
			}
		}
	}

	// Only now we can resolve paths
	result = regenerate(result, result, result, seen, retrieve, undry_paths, old, []);

	if (result.undried != null && result.dry) {
		return result.undried;
	}

	return result;
}

exports.stringify       = stringify;
exports.toObject        = toDryObject;
exports.parse           = parse;
exports.clone           = clone;
exports.Classes         = {};
exports.registerClass   = registerClass;
exports.registerUndrier = registerUndrier;
exports.registerDrier   = registerDrier;
exports.findClass       = findClass;
exports.walk            = walk;