var assert = require('assert'),
    Dry    = require('../index.js'),
    Blast  = require('protoblast')(false),
    Deck   = Blast.Classes.Deck;

Dry.Classes = Blast.Classes;
Dry.Classes.__Protoblast = Blast;

function MyPerson(firstname, lastname) {
	this.firstname = firstname;
	this.lastname  = lastname;
}

MyPerson.prototype.fullname = function fullname() {
	return this.firstname + ' ' + this.lastname;
};

describe('Dry', function TestDry() {

	var dryCirc2,
	    dryCirc,
	    Table;

	describe('.stringify()', function() {
		it('should stringify the object', function() {

			var obj = {},
			    arr = [0,1,2],
			    undry,
			    json,
			    dry;

			obj.a = arr;
			obj.b = arr;

			json = JSON.stringify(obj);
			dry = Dry.stringify(obj);

			assert.equal(dry.length < json.length, true, 'Dry string is not shorter than JSON string');

			undry = Dry.parse(dry);

			assert.equal(undry.a, undry.b, 'Array a & b should be references to the same array');
		});

		it('should stringify circular references', function() {

			var obj = {test: true, arr: [0,1,2]},
			    dry;

			obj.circle = obj;

			dry = Dry.stringify(obj);
			dryCirc = dry;

			assert.equal(dry, '{"test":true,"arr":[0,1,2],"circle":"~"}');

			obj.deep = {obj: obj};
			dryCirc2 = Dry.stringify(obj);
		});

		it('should use #toDry() method of objects', function() {

			var d = new Blast.Classes.Deck(),
			    ntemp,
			    temp,
			    ndry,
			    obj,
			    dry;

			d.push('first');
			obj = {nonroot: d};

			dry = Dry.stringify(d);
			ndry = Dry.stringify(obj);
			temp = JSON.parse(dry);
			ntemp = JSON.parse(ndry);

			assert.equal(temp.path, '__Protoblast.Classes.Deck');
			assert.equal(ntemp.nonroot.path, '__Protoblast.Classes.Deck');
		});

		it('should serialize & revive registered classes', function() {

			var original,
			    dried,
			    res;

			function Person(firstname, lastname) {
				this.firstname = firstname;
				this.lastname  = lastname;
			}

			Person.unDry = function unDry(value) {
				return new Person(value.firstname, value.lastname);
			};

			Person.prototype.toDry = function toDry() {
				return {
					value: {
						firstname : this.firstname,
						lastname  : this.lastname
					}
				};
			};

			Person.prototype.fullname = function fullname() {
				return this.firstname + ' ' + this.lastname;
			};

			Dry.registerClass(Person);

			original = new Person('Lies', 'Lefever');

			dried = Dry.stringify(original);

			res = Dry.parse(dried);

			assert.equal(res.fullname(), original.fullname());
		});

		it('should handle classes with circular references', function() {

			function SomeDoc(name) {
				this.name = name;
				this.tree = new Tree(this);
			}

			SomeDoc.unDry = function unDry(value) {
				var result;

				result = Object.create(SomeDoc.prototype);
				result.name = value.name;
				result.tree = value.tree;

				return result;
			};

			SomeDoc.prototype.toDry = function toDry() {
				return {
					value: {
						name : this.name,
						tree : this.tree
					}
				};
			};

			function Tree(doc) {
				this.doc = doc;
			}

			Tree.unDry = function unDry(value) {
				return new Tree(value.doc);
			};

			Tree.prototype.toDry = function toDry() {
				return {
					value: {
						doc: this.doc
					}
				};
			};

			Dry.registerClass(SomeDoc);
			Dry.registerClass(Tree);

			let doc = new SomeDoc('doctest');

			let objectified = Dry.toObject(doc);
			let parsed = Dry.parse(objectified);

			assert.strictEqual(parsed instanceof SomeDoc, true, 'Failed to revive SomeDoc instance');
			assert.strictEqual(parsed.name, 'doctest', 'Failed to revive name string');
			assert.strictEqual(parsed.tree instanceof Tree, true);
			assert.strictEqual(parsed.tree.doc, parsed, 'Failed to resolve circular reference');
		});

		it('should use registered driers', function() {

			var original,
			    dried,
			    res;

			Dry.registerDrier('MyPerson', function dryMyPerson(holder, key, value) {
				return {
					firstname : value.firstname,
					lastname  : value.lastname
				};
			});

			Dry.registerUndrier('MyPerson', function unDryMyPerson(holder, key, value) {
				return new MyPerson(value.firstname, value.lastname);
			});

			original = new MyPerson('Lies', 'Lefever');

			dried = Dry.stringify(original);

			assert.strictEqual(dried, '{"dry":"MyPerson","value":{"firstname":"Lies","lastname":"Lefever"},"drypath":[]}');

			res = Dry.parse(dried);

			assert.equal(res.fullname(), original.fullname());

			// Also for root array
			dried = Dry.stringify([original]);
			res = Dry.parse(dried);

			assert.equal(res[0].fullname(),  original.fullname());
			assert.equal(Array.isArray(res), true);
		});

		it('should use registerd driers without paths added', function() {

			function MyNamedObject(name) {
				this.name = name;
			}

			Dry.registerClass(MyNamedObject);

			Dry.registerDrier('MyNamedObject', function dryMyObject(holder, key, value) {
				return String(value.name);
			}, {add_path: false});

			Dry.registerUndrier('MyNamedObject', function undryMyObject(holder, key, value) {
				return new MyNamedObject(value);
			});

			var alpha = new MyNamedObject('alpha');

			assert.strictEqual(alpha.name, 'alpha');

			var dried = Dry.toObject(alpha);

			assert.deepStrictEqual(dried, { dry: 'MyNamedObject', value: 'alpha' });

			var revived = Dry.parse(dried);

			assert.notStrictEqual(revived, undefined, 'MyNamedObject "alpha" was not revived at all');
			assert.strictEqual(revived.constructor, MyNamedObject, 'The revived object is not of the same constructor');
			assert.strictEqual(revived.name, alpha.name);

			var dried = Dry.toObject([alpha]);

			assert.deepStrictEqual(dried, [ { dry: 'MyNamedObject', value: 'alpha' } ]);

			revived = Dry.parse(dried);

			assert.strictEqual(revived[0].constructor, MyNamedObject, 'The revived object is not of the same constructor');
			assert.strictEqual(revived[0].name, alpha.name);

			var obj = {
				a: [alpha],
				b: {alpha: alpha},
				c: [[alpha]]
			};

			dried = Dry.toObject(obj);

			assert.deepStrictEqual(dried, { a: [ { dry: 'MyNamedObject', value: 'alpha' } ], b: { alpha: '~a~0' }, c: [ [ '~a~0' ] ] });

			parsed = Dry.parse(dried);

			assert.strictEqual(parsed.a[0], parsed.b.alpha, 'These should be a reference to the same value');
			assert.strictEqual(parsed.a[0], parsed.c[0][0], 'These should be a reference to the same value');
			assert.strictEqual(parsed.b.alpha.name, 'alpha');
		});

		it('should handle #toJSON calls properly', function() {

			var undried,
			    dried,
			    obj,
			    a;

			a = {a: 1};

			obj = {
				zero: {toJSON: function(){return 0}},
				one: a,
				two: a
			};

			dried = Dry.stringify(obj);
			undried = Dry.parse(dried);

			assert.equal(undried.zero, 0, '#toJSON was not respected');
			assert.equal(undried.one, undried.two, 'References have been messed up');
		});

		it('should drop functions', function() {

			var undried,
			    dried,
			    fnc = function test() {},
			    obj = {a: fnc, b: 1};

			dried = Dry.stringify(obj);
			undried = Dry.parse(dried);

			assert.equal(Dry.stringify(fnc), undefined, 'Function should be returned as undefined');
			assert.equal(undried.a, undefined, 'Functions should be returned as undefined');
			assert.equal(undried.b, 1, 'Other property did not revive');
		});

		it('should escape strings starting with the path separator', function() {

			var expected,
			    original,
			    dried,
			    res;

			original = {
				start : {
					regular_string: '~start'
				},
				regular_string   : '~start',
			};

			original.ref = original.start;

			dried = Dry.stringify(original);

			res = Dry.parse(dried);

			expected = `{"start":{"regular_string":"\\\\x7estart"},"regular_string":"\\\\x7estart","ref":"~start"}`;

			assert.equal(dried,                    expected);
			assert.equal(res.start.regular_string, '~start');
			assert.equal(res.regular_string,       '~start');
			assert.equal(res.ref,                  res.start);
		});

		it('should handle keys with the path separator', function() {

			var expected,
			    original,
			    dried,
			    res;

			original = {
				'start~': {
					a: 1
				}
			};

			original.ref = original['start~'];

			dried = Dry.stringify(original);

			res = Dry.parse(dried);

			expected = `{"start~":{"a":1},"ref":"~start\\\\x7e"}`;

			assert.equal(dried,            expected);
			assert.equal(res['start~'].a,  1);
			assert.equal(res.ref,          res['start~']);
		});

		it('should use shorter paths when possible', function() {

			var expected,
			    original,
			    dried,
			    res;

			original = {
				a_very_long_key: {
					a: 1
				},
			};

			original.short = original.a_very_long_key;
			original['s~'] = original.a_very_long_key;
			original.third = original.a_very_long_key;

			dried = Dry.stringify(original);

			res = Dry.parse(dried);

			expected = `{"a_very_long_key":{"a":1},"short":"~a_very_long_key","s~":"~short","third":"~s\\\\x7e"}`;

			assert.equal(dried,               expected);
			assert.equal(res.short, res.a_very_long_key);
			assert.equal(res.third, res.a_very_long_key);
			assert.equal(res['s~'], res.a_very_long_key);
		});

		it('should use a replacer if given', function() {

			var original,
			    dried,
			    res;

			original = {
				deck : new Deck(),
				fnc  : function someFunction(){},
				str  : ''
			};

			dried = Dry.stringify(original, function replacer(key, value) {
				if (typeof value == 'function') {
					return "a function called '" + value.name + "'";
				}

				return value;
			});

			var expected = `{"deck":{"value":{"ic":0,"dict":{},"array":[],"attributes":{}},"path":"__Protoblast.Classes.Deck","dry":"toDry","drypath":["deck"]},"fnc":"a function called 'someFunction'","str":""}`;

			assert.equal(dried, expected);
		});

		it('should use formatting spaces if given', function() {

			var expected,
			    nr_dried,
			    undried,
			    dried,
			    obj;

			obj = {
				a: [{b: 1}],
				c: {d: 1}
			};

			expected = '{\n  "a": [\n    {\n      "b": 1\n    }\n  ],\n  "c": {\n    "d": 1\n  }\n}';

			dried = Dry.stringify(obj, null, '  ');
			nr_dried = Dry.stringify(obj, null, 2);

			undried = Dry.parse(dried);

			assert.equal(dried, expected);
			assert.equal(nr_dried, expected);

			assert.equal(undried.c.d, obj.c.d);
			assert.equal(undried.a[0].b, obj.a[0].b);
		});

		it('should handle Infinity', function() {

			var undried,
			    dried,
			    obj;

			obj = {
				a : 1,
				b : Infinity,
				c : -Infinity
			};

			dried = Dry.stringify(obj);
			undried = Dry.parse(dried);

			assert.equal(undried.a, 1);
			assert.equal(undried.b, Infinity);
			assert.equal(undried.c, -Infinity);
		});

		it('should handle RegExp', function() {

			var undried,
			    dried,
			    obj;

			obj = {
				regex : /test/i
			};

			dried = Dry.stringify(obj);
			undried = Dry.parse(dried);

			assert.equal(undried.regex.constructor.name, 'RegExp');
			assert.equal(undried.regex+'', '/test/i');

			obj = /rooted/i;
			dried = Dry.stringify(obj);
			undried = Dry.parse(dried);

			assert.equal(undried.constructor.name, 'RegExp');
			assert.equal(undried+'', '/rooted/i');
		});

		it('should handle dates', function() {

			var undried,
			    dried,
			    obj;

			obj = {
				date : new Date()
			};

			dried = Dry.stringify(obj);
			undried = Dry.parse(dried);

			assert.equal(undried.date.constructor.name, 'Date');
			assert.equal(undried.date+'', obj.date+'');

			obj = obj.date;
			dried = Dry.stringify(obj);
			undried = Dry.parse(dried);

			assert.equal(undried.constructor.name, 'Date');
			assert.equal(undried+'', obj+'');
		});

		it('should handle Objects without a prototype', function() {

			var obj = Object.create(null);

			obj.a = 1;
			obj.b = 2;

			var str = Dry.stringify(obj);

			assert.deepEqual(Dry.parse(str), obj);
		});
	});

	describe('.parse()', function() {

		it('should parse circular references', function() {

			var undry2,
			    undry;

			undry = Dry.parse(dryCirc);

			assert.equal(undry === undry.circle, true, 'Circular reference in undried object is gone');

			undry2 = Dry.parse(dryCirc2);

			assert.equal(undry2 === undry2.deep.obj, true, 'Deep circular reference in undried object is gone');
		});

		it('should use undry on dried objects that need to be revived', function() {

			var d = new Deck(),
			    dry,
			    undry;

			d.push('first');
			dry = Dry.stringify({mydeck: d});

			undry = Dry.parse(dry);

			assert.equal(undry.mydeck instanceof Deck, true);
		});

		it('should also be able to revive root objects', function() {

			var d = new Deck(),
			    dry,
			    undry;

			d.push('first');
			dry = Dry.stringify(d);

			undry = Dry.parse(dry);

			assert.equal(undry instanceof Deck, true);
		});

		it('should handle complicated revive structures', function() {

			var d = new Deck(),
			    d2 = new Deck(),
			    arr,
			    dry,
			    sub,
			    undry;

			arr = [0,1,2];
			d2.push('sub');
			d2.set('arr', arr);

			d.push('first');
			d.set('subdeck', d2);
			d.set('arr', arr);

			dry = Dry.stringify(d);

			undry = Dry.parse(dry);
			sub = undry.get('subdeck');

			assert.equal(undry instanceof Deck, true, 'Undried object should be a Deck instance');
			assert.equal(sub instanceof Deck, true, 'Sub entry of object should also be a Deck instance');
			assert.equal(undry.get('arr') === sub.get('arr'), true, 'Array in both Decks should be a reference');
		});

		it('should handle recursive links first returned by a toJSON call', function() {

			var undried,
			    dried,
			    root,
			    a,
			    x;

			a = {a: 'a'};
			x = {toJSON: function() {return a}};
			y = {toJSON: function() {return 'y'}};

			root = {
				x: x,
				y: y,
				last: a
			};

			dried = Dry.stringify(root);
			undried = Dry.parse(dried);

			assert.equal(undried.last, undried.x);
		});

		it('should handle the safe character', function() {

			var undried,
			    input = '~This is ~not~ undefined',
			    dried = Dry.stringify(input),
			    driedtwo = Dry.stringify({a: input});

			undried = Dry.parse(dried);

			assert.equal(driedtwo, '{"a":"\\\\x7eThis is ~not~ undefined"}', 'Special chars at the start should be escaped');
			assert.equal(dried, JSON.stringify(input), 'Special chars should not be escaped in a regular string');
			assert.equal(undried, input);
		});

		it('should prevent getting keys out of the prototype', function() {

			var dried,
			    obj,
			    res;

			obj = {
				start: {},
				ref  : '~start~__proto__~constructor'
			};

			// Use regular json for this hack
			dried = JSON.stringify(obj);

			res = Dry.parse(dried);

			assert.equal(res.ref, undefined);
		});

		it('should pass replaced undried values to other undriers', function() {

			var Doc = function Doc(options) {
				this.options = options;
			};

			Doc.unDry = function unDry(obj, force) {

				if (obj.options.name == 'other') {
					assert.equal(obj.options.deep.join(''), 'very deep');
				} else if (obj.options.name == 'inst') {
					assert.equal(obj.options.other instanceof Doc, true);
				}

				return new Doc(obj.options);
			};

			Doc.prototype.toDry = function toDry() {
				return {
					value: {
						options: this.options
					}
				}
			};

			Dry.registerClass(Doc);

			var arr = [],
			    deep,
			    inst,
			    other;

			// An array we'll put in an instance and refer to afterwards
			deep = ['very deep'];

			// The other instance
			other = new Doc({name: 'other', bla: 1, deep: deep});

			// The top instance
			inst = new Doc({name: 'inst', other: other});

			// The other instance
			arr.push({other: other});

			// The instance with a reference to `other`
			arr.push(inst);

			// And also push the deep array
			arr.push(deep)

			var dried = Dry.toObject(arr);
			var undried = Dry.parse(dried);

			assert.equal(undried[2].join(''), 'very deep');
			assert.equal(undried[2], undried[0].other.options.deep);
			assert.equal(undried[0].other instanceof Doc, true);
			assert.equal(undried[1] instanceof Doc, true);
		});

		it('should ignore undriers if class is not registered', function() {

			var Doc = function DocUnregistered(options) {
				this.options = options;
			};

			Doc.unDry = function unDry(obj, force) {
				throw new Error('Unregistered class should not be undried');
			};

			Doc.prototype.toDry = function toDry() {
				return {
					value: {
						options: this.options
					}
				}
			};

			var arr = [],
			    deep,
			    inst;

			deep = ['very deep'];
			inst = new Doc({name: 'inst', deep: deep});

			arr = [deep, inst, deep];

			var dried = Dry.toObject(arr);
			var undried = Dry.parse(dried);

			assert.equal(undried[0].join(''), 'very deep');
			assert.equal(undried[1] instanceof Doc, false);
			assert.equal(undried[1].options.deep, undried[0]);
			assert.equal(undried[2], undried[0]);
		});

		it('should try to resolve out-of-order references', function() {
			var original,
			    holder;

			original = {
				name: 'original',
				long_key: ['long_key']
			};

			holder = {
				name       : 'holder',
				temp       : {},
				original   : original,
				long_key   : original.long_key
			};

			var dried = Dry.toObject(holder);

			// Now we force an out-of-order reference
			dried.temp = '~long_key';

			var undried = Dry.parse(dried);

			assert.equal(undried.temp == undried.long_key, true);
			assert.equal(undried.temp[0], 'long_key');
			assert.equal(undried.original.long_key, undried.temp);
		});

		it('should fix circular references that were incorrectly passed to an undrier', function() {

			function Alpha(options) {
				this.alpha = true;
				this.options = options;
			}

			function Beta(options) {
				this.beta = true;
				this.options = options;
			}

			Alpha.prototype.toDry = Beta.prototype.toDry = function toDry() {
				return {
					value: {
						options: this.options
					}
				}
			};

			Alpha.unDry = Beta.unDry = function unDry(value) {
				return new this(value.options);
			};

			Dry.registerClass(Alpha);
			Dry.registerClass(Beta);

			var arr,
			    a,
			    b;

			a = new Alpha({name: 'a'});
			b = new Beta({name: 'b'});
			arr = [a, b];

			a.options.b = b;
			b.options.parent_a = a;

			var dried = Dry.toObject(arr);
			var undried = Dry.parse(dried);

			a = undried[0];
			b = undried[1];

			assert.equal(a.options.b, b);
			assert.equal(b.options.parent_a, a);

			a = new Alpha({});
			b = new Beta({});
			var date = new Date();
			b.options.date = date;
			a.options.b = b;

			dried = Dry.toObject([a, date]);
			undried = Dry.parse(dried);

			assert.strictEqual(undried[0].alpha, true);
			assert.strictEqual(undried[0].constructor, Alpha);
			assert.strictEqual(undried[0].options.b.beta, true);
			assert.strictEqual(undried[0].options.b.constructor, Beta);
			assert.strictEqual(+undried[0].options.b.options.date, +date);
			assert.strictEqual(+undried[1], +date, 'The second date reference was not undried correctly');

			var c = new Beta({});
			c.options.date = date;
			b.options.c = c;

			dried = Dry.toObject([b, a, c, date]);
			undried = Dry.parse(dried);

			assert.strictEqual(undried[1].alpha, true);
			assert.strictEqual(undried[1].constructor, Alpha);
			assert.strictEqual(undried[1].options.b.beta, true);
			assert.strictEqual(undried[1].options.b.constructor, Beta);
			assert.strictEqual(+undried[1].options.b.options.date, +date);
			assert.strictEqual(+undried[3], +date, 'The second date reference was not undried correctly');
		});
	});

	describe('.toObject()', function() {
		it('should create an object', function() {

			var original,
			    dry_obj,
			    result,
			    entry;

			original = {
				date   : new Date(),
				nr     : 1,
				arr    : [null],
				regex  : /test/i,
				deck   : new Deck()
			};

			entry = {
				a: 1
			};

			original.deck.set('entry', entry);

			dry_obj = Dry.toObject(original);
			result = Dry.parse(dry_obj);

			assert.notEqual(dry_obj.deck.value.dict.entry.value,     entry, 'Same references detected!');
			assert.equal(Blast.Bound.Object.alike(original, result), true,  'The parsed object should be similar to the original');
		});
	});

	describe('.clone()', function() {

		it('should deep clone objects', function() {

			var original,
			    clone;

			original = {
				date   : new Date(),
				nr     : 1,
				arr    : [null],
				regex  : /test/i
			};

			original.circle = original;

			clone = Dry.clone(original);

			assert.equal(clone.date.constructor.name, 'Date');
			assert.equal(clone.date+'', original.date+'');

			assert.equal(clone.nr, original.nr);
			assert.equal(clone.arr[0], original.arr[0]);

			assert.equal(clone.regex.constructor.name, 'RegExp');

			assert.equal(clone.circle, clone);
		});

		it('should use a clone method if it is available on the target', function() {

			var original,
			    clone;

			original = {
				clone: function() {
					return 1;
				}
			};

			clone = Dry.clone(original);

			assert.equal(clone, 1);
		});

		it('should use a custom method if given', function() {

			var dried,
			    temp,
			    flo;

			function Pet(species, name) {
				this.species = species;
				this.name = name;
			}

			// Create the new class now
			flo = new Pet('cat', 'Flo');

			temp = Dry.clone(flo);

			// No dry methods are added yet, so it should be a simple object
			assert.equal(temp.constructor == Object, true);
			assert.equal(temp.species, 'cat');
			assert.equal(temp.name,    'Flo');

			// First add a toJSON method, the final fallback
			Pet.prototype.toJSON = function toJSON() {
				return {
					species : this.species,
					name    : this.name
				};
			};

			temp = Dry.clone(flo);
			assert.equal(temp.constructor == Object, true);
			assert.equal(temp.species, 'cat');
			assert.equal(temp.name,    'Flo');

			// Add the toDry method
			Pet.prototype.toDry = function toDry() {
				return {
					value: {
						species : this.species,
						name    : this.name
					}
				};
			};

			temp = Dry.clone(flo);

			// No undry method is added yet, so it should be a simple object
			assert.equal(temp.constructor == Object, true);
			assert.equal(temp.species, 'cat');
			assert.equal(temp.name,    'Flo');

			// Add the undry methods
			Pet.unDry = function unDry(value) {
				return new Pet(value.species, value.name);
			}

			Pet.prototype.getDescription = function getDescription() {
				return this.name + ' is a ' + this.species;
			};

			Dry.registerClass(Pet);

			dried = Dry.stringify(flo);
			temp = Dry.parse(dried);

			assert.equal(temp.constructor === Pet, true);
			assert.equal(temp.getDescription(),    'Flo is a cat');

			dried = Dry.clone(flo, 'getDescription');

			// It should have used "getDescription" to clone it
			assert.equal(dried, 'Flo is a cat');

			// It should use the dry methods if no special clone method is available
			temp = Dry.clone(flo);

			assert.equal(temp.constructor === Pet, true);
			assert.equal(temp.getDescription(),    'Flo is a cat');
		});

		it('should use driers if nothing else is available', function() {

			var griet = new MyPerson('Griet', 'De Leener'),
			    temp;

			temp = Dry.clone(griet);

			assert.equal(temp.constructor === MyPerson, true);
			assert.equal(temp.firstname, 'Griet');
			assert.equal(temp.lastname,  'De Leener');
		});

		it('should use toDry & unDry if only those are available', function() {

			var List = function List(records, options) {
				this.records = records;
				this.options = options;
			};

			List.prototype.toDry = function toDry() {
				return {
					value: {
						options    : this.options,
						records    : this.records
					}
				};
			};

			List.unDry = function unDry(obj) {
				var result = new this(obj.records, obj.options);
				return result;
			};

			Dry.registerClass(List);

			var list = new List([1], {test: true});
			var clone = Dry.clone(list);

			assert.deepEqual(clone.records, list.records);
			assert.deepEqual(clone.options, list.options);
			assert.equal(clone.constructor.name, list.constructor.name);

			clone = Dry.clone([list]);

			assert.deepEqual(clone, [list]);
			assert.equal(clone[0].constructor.name, list.constructor.name);
		});

		it('should handle circular references', function() {

			Table = function Table() {
				this.options = {
					deep: {
						test: 1,
						self: this
					},
					created: Date.now()
				};
			};

			Table.prototype.toHawkejs = function toHawkejs(wm) {

				var result = new Table(),
				    options;

				wm.set(this, result);

				// Clone the options
				options = Dry.clone(this.options, 'toHawkejs', wm);

				result.options = options;

				return result;
			};

			var table = new Table();

			table.options.self = table;
			table.options.set = true;

			var clone = Dry.clone(table, 'toHawkejs');

			assert.strictEqual(clone.constructor.name, 'Table');
			assert.strictEqual(clone.options.self, clone);
			assert.strictEqual(clone.options.deep.self, clone);
			assert.strictEqual(clone.options.created, table.options.created);

			clone = Dry.clone(table.options, 'toHawkejs');
			clone = clone.deep.self;
			assert.strictEqual(clone.constructor.name, 'Table');
			assert.strictEqual(clone.options.self, clone);
			assert.strictEqual(clone.options.deep.self, clone);
			assert.strictEqual(clone.options.created, table.options.created);
		});

		it('should handle circular references in other instances that use a toDry method', function() {

			var Plate = function Plate(table) {
				this.table = table;
				this.options = {
					created_plate: Date.now()
				};
			};

			Plate.prototype.toDry = function toDry() {

				var value = {
					table   : this.table,
					options : this.options
				};

				return {
					value: value
				};
			};

			Plate.unDry = function unDry(value) {

				var result = new Plate(value.table);
				result.options = value.options;

				return result;
			};

			Dry.registerClass(Plate);

			var table = new Table(),
			    plate = new Plate(table);

			var clone = Dry.clone(plate, 'toHawkejs');

			assert.strictEqual(clone.table, clone.table.options.deep.self);
			assert.strictEqual(clone.constructor, Plate);

			plate.options.deep = {
				self: plate,
				table: plate.table
			};

			clone = Dry.clone(plate.options, 'toHawkejs');
		});
	});

	describe('.findClass(name)', function() {
		it('should find a registered class by name', function() {
			var result = Dry.findClass('Pet');

			assert.equal(result.name, 'Pet');
			assert.equal(Dry.findClass('PetThatDoesnotExist'), null);
		});

		it('should find a registered class by namespace & name', function() {

			function NamespacedClass() {};
			NamespacedClass.namespace = 'mynamespace';

			Dry.registerClass(NamespacedClass);

			assert.equal(Dry.findClass({namespace: 'mynamespace', name: 'NamespacedClass'}), NamespacedClass);
		});
	});
});