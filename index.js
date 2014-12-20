var lodash = {
        objects : {
            assign: require('lodash-node/modern/objects/assign'),
            defaults: require('lodash-node/modern/objects/defaults'),
            has: require('lodash-node/modern/objects/has'),
            clone: require('lodash-node/modern/objects/clone'),
            isArray: require('lodash-node/modern/objects/isArray'),
            isString: require('lodash-node/modern/objects/isString'),
            isFunction: require('lodash-node/modern/objects/isFunction'),
            isObject: require('lodash-node/modern/objects/isObject')
        },
        functions: require('lodash-node/modern/functions'),
        collections: require('lodash-node/modern/collections')
    },
    Model = require('model'),
    debug = function (message) { console.log(message); },
    Collection;

// Onyx.Collection (based on Backbone.Collection)
// -------------------

// If models tend to represent a single row of data, a Onyx Collection is
// more analogous to a table full of data ... or a small slice or page of that
// table, or a collection of rows that belong together for a particular reason
// -- all of the messages in this particular folder, all of the documents
// belonging to this particular author, and so on. Collections maintain
// indexes of their models, both in order, and for lookup by `id`.

// Create a new **Collection**, perhaps to contain a specific type of `model`.
// If a `comparator` is specified, the Collection will maintain
// its models in sort order, as they're added and removed.
Collection = function(models, options) {
    options = options || {};
    if (options.model) {
        this.model = options.model;
    }
    if (options.comparator !== void 0) {
        this.comparator = options.comparator;
    }
    this._reset();
    this.initialize.apply(this, arguments);
    if (models) {
        this.reset(models, lodash.objects.assign({silent: true}, options));
    }
};

// Define the Collection's inheritable methods.
lodash.objects.assign(Collection.prototype, {

    // The default model for a collection is just a **Onyx.Model**.
    // This should be overridden in most cases.
    model: Model,

    // Initialize is an empty function by default. Override it with your own
    // initialization logic.
    initialize: function () {},

    // The JSON representation of a Collection is an array of the
    // models' attributes.
    toJSON: function(options) {
        return this.map( function (model) {
            return model.toJSON(options);
        });
    },

    // Add a model, or list of models to the set.
    add: function(models, options) {
        var defaultOptions;
        defaultOptions = {add: true, remove: false};
        return this.set(models, lodash.objects.assign({merge: false}, options, defaultOptions));
    },

    // Remove a model, or a list of models from the set.
    remove: function(models, options) {
        var singular,
            model,
            index,
            id,
            i;

        // check if is a single or multiple model
        singular = !lodash.objects.isArray(models);

        // create a new array with index 0 or clone the models
        models = singular ? [models] : lodash.objects.clone(models);

        // default set for options
        options = options || {};

        for (i = 0, length = models.length; i < length; i++) {
            model = models[i] = this.get(models[i]);
            if (!model) continue;
            id = this.modelId(model.attributes);
            if (id !== null) {
                delete this._byId[id];
            }
            delete this._byId[model.cid];
            index = this.indexOf(model);
            this.models.splice(index, 1);
            this.length--;
            this._removeReference(model, options);
        }
        return singular ? models[0] : models;
    },

    // Update a collection by `set`-ing a new list of models, adding new ones,
    // removing models that are no longer present, and merging models that
    // already exist in the collection, as necessary. Similar to **Model#set**,
    // the core operation for updating the data contained by the collection.
    set: function(models, options) {
        var defaultOptions,
            singular,
            id,
            model,
            attrs,
            existing,
            sort,
            at,
            sortable,
            sortAttr,
            toAdd,
            toRemove,
            modelMap,
            add,
            merge,
            remove,
            order,
            orderChanged,
            i;

        defaultOptions = {add: true, remove: true, merge: true};
        options = lodash.objects.defaults({}, options, defaultOptions);

        // check if is a single model collection
        singular = !lodash.objects.isArray(models);

        models = singular ? (models ? [models] : []) : models.slice();
        at = options.at;
        if (at < 0) {
            at += this.length + 1;
        }
        sortable = this.comparator && (at === null) && options.sort !== false;
        sortAttr = lodash.objects.isString(this.comparator) ? this.comparator : null;

        // initial setup of arrays and objects
        toAdd = [];
        toRemove = [];
        modelMap = {};
        add = options.add;
        merge = options.merge;
        remove = options.remove;
        order = !sortable && add && remove ? [] : false;
        orderChanged = false;

        // Turn bare objects into model references, and prevent invalid models
        // from being added.
        for (i = 0, length = models.length; i < length; i++) {

            attrs = models[i];
            // If a duplicate is found, prevent it from being added and
            // optionally merge it into the existing model.
            existing = this.get(attrs);
            if (existing) {
                if (remove) {
                    modelMap[existing.cid] = true;
                }
                if (merge && attrs !== existing) {
                    attrs = this._isModel(attrs) ? attrs.attributes : attrs;
                    existing.set(attrs, options);
                    if (sortable && !sort && existing.hasChanged(sortAttr)) {
                        sort = true;
                    }
                }
                models[i] = existing;

                // If this is a new, valid model, push it to the `toAdd` list.
            } else if (add) {
                model = models[i] = this._prepareModel(attrs, options);
                if (!model) continue;
                toAdd.push(model);
                this._addReference(model, options);
            }

            // Do not add multiple models with the same `id`.
            model = existing || model;
            if (!model) continue;
            id = this.modelId(model.attributes);
            if (order && (model.isNew() || !modelMap[id])) {
                order.push(model);
                // Check to see if this is actually a new model at this index.
                orderChanged = orderChanged || !this.models[i] || model.cid !== this.models[i].cid;
            }

            modelMap[id] = true;
        }

        // Remove nonexistent models if appropriate.
        if (remove) {
            for (i = 0, length = this.length; i < length; i++) {
                if (!modelMap[(model = this.models[i]).cid]) {
                    toRemove.push(model);
                }
            }
            if (toRemove.length) {
                this.remove(toRemove, options);
            }
        }

        // See if sorting is needed, update `length` and splice in new models.
        if (toAdd.length || orderChanged) {
            if (sortable) {
                sort = true;
            }
            this.length += toAdd.length;
            if (at !== null) {
                for (i = 0, length = toAdd.length; i < length; i++) {
                    this.models.splice(at + i, 0, toAdd[i]);
                }
            } else {
                if (order) {
                    this.models.length = 0;
                }
                var orderedModels = order || toAdd;
                for (i = 0, length = orderedModels.length; i < length; i++) {
                    this.models.push(orderedModels[i]);
                }
            }
        }

        // Sort the collection if appropriate.
        if (sort) {
            this.sort();
        }

        // Return the added (or merged) model (or models).
        return singular ? models[0] : models;
    },

    // When you have more items than you want to add or remove individually,
    // you can reset the entire set with a new list of models
    // Useful for bulk operations and optimizations.
    reset: function(models, options) {
        options = options ? lodash.objects.clone(options) : {};
        for (var i = 0, length = this.models.length; i < length; i++) {
          this._removeReference(this.models[i], options);
        }
        options.previousModels = this.models;
        this._reset();
        models = this.add(models, lodash.objects.assign({silent: true}, options));
        return models;
    },

    // Add a model to the end of the collection.
    push: function(model, options) {
        return this.add(model, lodash.objects.assign({at: this.length}, options));
    },

    // Remove a model from the end of the collection.
    pop: function(options) {
        var model = this.at(this.length - 1);
        this.remove(model, options);
        return model;
    },

    // Add a model to the beginning of the collection.
    unshift: function(model, options) {
        return this.add(model, lodash.objects.assign({at: 0}, options));
    },

    // Remove a model from the beginning of the collection.
    shift: function(options) {
        var model = this.at(0);
        this.remove(model, options);
        return model;
    },

    // Slice out a sub-array of models from the collection.
    slice: function() {
        return slice.apply(this.models, arguments);
    },

    // Get a model from the set by id. Obj can either be the entire model attributes
    // or just the id of the model
    get: function(obj) {
        var id;

        if (obj === null) {
            return void 0;
        }

        // if model get id from attributes, otherwise we already have the id
        id = this.modelId(this._isModel(obj) ? obj.attributes : obj);

        return this._byId[obj] || this._byId[id] || this._byId[obj.cid];
    },

    // Get the model at the given index on the collection
    at: function(index) {
        if (index < 0) {
            index += this.length;
        }
        return this.models[index];
    },

    // Return models with matching attributes. Useful for simple cases of
    // `filter`.
    where: function(attrs, first) {
        // detect which lodash method to use, find or filter based on first parameter
        return this[first ? 'find' : 'filter'](this.models, attrs);
    },

    // Return the first model with matching attributes. Useful for simple cases
    // of `find`.
    findWhere: function(attrs) {
        return this.where(attrs, true);
    },

    // Force the collection to re-sort itself. You don't need to call this under
    // normal circumstances, as the set will maintain sort order as each item
    // is added.
    sort: function(options) {
        if (!this.comparator) {
            throw new Error('Cannot sort a set without a comparator');
        }

        options = options || {};

        // Run sort based on type of `comparator`.
        if (lodashs.objects.isString(this.comparator) || this.comparator.length === 1) {
            this.models = this.sortBy(this.comparator, this);
        } else {
            this.models.sort(lodash.functions.bind(this.comparator, this));
        }

        return this;
    },

    // Pluck an attribute from each model in the collection.
    pluck: function(attr) {
        return lodash.collections.invoke(this.models, 'get', attr);
    },

    // Create a new collection with an identical list of models as this one.
    clone: function() {
        return new this.constructor(this.models, {
            model: this.model,
            comparator: this.comparator
        });
    },

    // Define how to uniquely identify models in the collection.
    modelId: function (attrs) {
        return attrs[this.model.prototype.idAttribute || 'id'];
    },

    // Private method to reset all internal state. Called when the collection
    // is first initialized or reset.
    _reset: function() {
        this.length = 0;
        this.models = [];
        this._byId  = {};
    },

    // Prepare a hash of attributes (or other model) to be added to this
    // collection.
    // TODO auto-mode for creating a model
    _prepareModel: function(attrs, options) {
        // if it is a model, save a reference of the collection and add it
        if (this._isModel(attrs)) {
          if (!attrs.collection) {
              attrs.collection = this;
          }
          return attrs;
        }
        // if this is just a hash of attributes, create a new instance of the model
        // of this collection
        // TODO remove line bellow
        options = options ? lodash.objects.clone(options) : {};
        options.collection = this;
        var model = new this.model(attrs, options);
        if (!model.validationError.length) {
            return model;
        }
        return false;
    },

    // Method for checking whether an object should be considered a model for
    // the purposes of adding to the collection.
    _isModel: function (model) {
        return model instanceof Model;
    },

    // Internal method to create a model's ties to a collection.
    _addReference: function(model, options) {
        var id;
        this._byId[model.cid] = model;
        id = this.modelId(model.attributes);
        if (id !== null) {
            this._byId[id] = model;
        }
    },

    // Internal method to sever a model's ties to a collection.
    _removeReference: function(model, options) {
        if (this === model.collection) {
            delete model.collection;
        }
    },

});

// Lodash methods that we want to implement on the Collection.
// 90% of the core usefulness of Onyx Collections is actually implemented here
// all the aliases were removed (each -> forEach, and things like that)
var methods = ['forEach', 'map', 'reduce', 'reduceRight', 'find', 'filter',
    'reject', 'every', 'some', 'contains', 'invoke', 'max', 'min', 'toArray',
    'size', 'first', 'initial', 'rest', 'last', 'without', 'difference',
    'indexOf', 'shuffle', 'lastIndexOf', 'sample', 'partition'];

// Mix in each Lodash method as a proxy to `Collection#models`.
lodash.collections.forEach(methods, function(method) {
  if (!lodash.collections[method]) return;
  Collection.prototype[method] = function() {
    var args = [].slice.call(arguments);
    args.unshift(this.models);
    return lodash.collections[method].apply(lodash.collections, args);
  };
});

// Lodash methods that take a property name as an argument.
var attributeMethods = ['groupBy', 'countBy', 'sortBy', 'indexBy'];

// Use attributes instead of properties.
lodash.collections.forEach(attributeMethods, function(method) {
  if (!lodash.collections[method]) return;
  Collection.prototype[method] = function(value, context) {
    var iterator = lodash.objects.isFunction(value) ? value : function(model) {
      return model.get(value);
    };
    return lodash.collections[method](this.models, iterator, context);
  };
});

// same extend function used by backbone
Collection.extend = function(protoProps, staticProps) {
    var parent,
        child,
        Surrogate;

    parent = this;

    // The constructor function for the new subclass is either defined by you
    // (the "constructor" property in your `extend` definition), or defaulted
    // by us to simply call the parent's constructor.
    if (protoProps && lodash.objects.has(protoProps, 'constructor')) {
        child = protoProps.constructor;
    } else {
        child = function () {
            return parent.apply(this, arguments);
        };
    }

    // Add static properties to the constructor function, if supplied.
    lodash.objects.assign(child, parent, staticProps);

    // Set the prototype chain to inherit from `parent`, without calling
    // `parent`'s constructor function.
    Surrogate = function () {
        this.constructor = child;
    };
    Surrogate.prototype = parent.prototype;
    child.prototype = new Surrogate;

    // Add prototype properties (instance properties) to the subclass,
    // if supplied.
    if (protoProps) lodash.objects.assign(child.prototype, protoProps);

    // Set a convenience property in case the parent's prototype is needed
    // later.
    child.__super__ = parent.prototype;

    return child;
};

module.exports = Collection;
