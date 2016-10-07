(function() {
    'use strict';


    const log = require('ee-log');
    const type = require('ee-types');
    const ORMExtension = require('related-extension');



    module.exports =  class EventLog extends ORMExtension {


        constructor(options) {
            super(options);

            this._name = 'eventLog';
            this.logEntityName = options && options.logEntityName ? options.logEntityName : 'eventLog';
            this.logActionEntityName = this.logEntityName+'Action';
            this.logEntityEntityName = this.logEntityName+'Entity';
            this.logGroupEntityName = this.logEntityName+'Group';
            this.logMappingEntityName = this.logEntityName+'Group_eventLogEntity';

            this.entities = new Map();
            this.groups = new Map();
        }




        /**
         * make sure we know when we are able to load the
         * monitoring stuff from the db
         */
        setVariables(variables) {
            super.setVariables(variables);

            if (type.object(variables) && variables.orm) {

                // check if the orm is loaded, if not wait for that
                // load our config as soon the orm is ready
                if (variables.orm.isLoaded()) this.loadConfiguration();
                else variables.orm.on('load', () => this.loadConfiguration());
            }
        }





        // poll the db for changes
        reload() {
            this.loadConfiguration();
        }





        /**
         * load the configiration from the db and reload the
         * appropriate entities
         */
        loadConfiguration() {
            for (const dbName of this.orm.getDatabaseNames().keys()) {
                if (this.orm[dbName][this.logEntityName]) {
                    // we're active on this db, load config
                    const db = this.orm[dbName];

                    if (!type.function(db[this.logEntityEntityName])) throw new Error(`Failed to load the eventLog entities from the database, the table ${this.logEntityEntityName} does not exist!`);

                    // since we're referencing the evebtLogEntity twice from
                    // the eventLogGroup we need to define custom names
                    if (!db[this.logGroupEntityName].targetEntity) {
                        db[this.logGroupEntityName].setReferenceAccessorName('id_eventLogEntity', 'targetEntity');
                        db[this.logGroupEntityName].setMappingAccessorName('eventLogGroup_eventLogEntity', 'eventLogEntity');
                        db[this.logEntityEntityName].setMappingAccessorName('eventLogGroup_eventLogEntity', 'eventLogGroup');

                        // add also a method for the user to manually invoke events
                        db.addEventLog = (entityName, actionName, options) => {
                            const customEventData = {};

                            let sourceData;
                            if (options.sourceEntity) {
                                sourceData = {
                                      name: options.sourceEntity
                                    , via: options.via
                                };
                            }

                            customEventData.data = {
                                  fields: options.fields
                                , sourceEntity: sourceData
                            }

                            customEventData[this.logActionEntityName] = db[this.logActionEntityName]({identifier: actionName});
                            customEventData[this.logEntityEntityName] = db[this.logEntityEntityName]({identifier: entityName});
                            customEventData.userId = options.userId;
                            customEventData.affectedId = options.id;
                            customEventData.affectedSecondaryId = options.secondaryId;
                            customEventData.affectedStringId = options.stringId;

                            return new (db[this.logEntityName])(customEventData).save();
                        }
                    }


                    const dbEntities = new Map();
                    const dbGroups = new Map();
                    const entitiyIdMap = new Map();

                    const oldEntities = this.entities.has(dbName) ? new Set(dbEntities.keys()) : new Set();

                    this.entities.set(dbName, dbEntities);
                    this.groups.set(dbName, dbGroups);



                    // get entities to apply the extension to
                    db[this.logEntityEntityName]('*').get(this.logMappingEntityName, '*').get(this.logGroupEntityName, '*').raw().find().then((entities) => {


                        entities.forEach((entity) => {

                            // remove mapping table
                            if (entity[this.logMappingEntityName]) {
                                entity.groups = entity[this.logMappingEntityName].map((mapping) => ({
                                      via: mapping.via
                                    , identifier: mapping[this.logGroupEntityName].identifier
                                    , targetEntityId: mapping[this.logGroupEntityName].id_eventLogEntity
                                }));
                            } else entity.groups = [];

                            // remove original array
                            delete entity[this.logGroupEntityName];

                            // make sure the extension is loaded on the table
                            dbEntities.set(entity.identifier, entity);

                            // store in id map
                            entitiyIdMap.set(entity.id, entity);

                            // remove from loit of the old entties
                            if (oldEntities.has(entity.identifier)) oldEntities.delete(entity.identifier);

                            // add connection to all groups
                            entity.groups.forEach((group) => {
                                if (!dbGroups.has(group.identifier)) dbGroups.set(group.identifier, {targetEntityId: group.targetEntityId});
                            });

                            // finally reload the orm entity
                            this.reloadEntity(dbName, entity.identifier);
                        });


                        // assign entities to groups
                        for (const group of dbGroups.values()) {
                            const entity = entitiyIdMap.get(group.targetEntityId);

                            group.targetEntity = {
                                  id: entity.id
                                , identifier: entity.identifier
                            };
                        }


                        // reload old entities
                        for (const entityName of oldEntities) this.reloadEntity(dbName, entityName);
                    }).catch(log);
                }
            }
        }




        /*
         * apply the extension if the current db has the tables
         * and the table was registred for monitoring
         */
        useOnModel(definition) {
            return this.entities.has(definition.databaseName) && this.entities.get(definition.databaseName).has(definition.name);
        }





        onAfterInsert(model, transaction) {
            return this.createSimpleLog(model, transaction, 'insert');
        }


        onAfterUpdate(model, transaction) {
            return this.createSimpleLog(model, transaction, 'update');
        }


        onAfterDelete(model, transaction) {
            return this.createSimpleLog(model, transaction, 'delete');
        }





        createSimpleLog(model, transaction, method) {
            const dbName = model.getDefinition().databaseName;
            const entityName = model.getEntityName();
            const entity = this.entities.get(dbName).get(entityName);
            const definition = model.getDefinition();
            const primaryKeys = definition.primaryKeys.map(name => definition.columns[name]);
            const data = {
                created: Date.now()
            };


            data.data = {fields: model.getChangedKeys()}
            data[this.logActionEntityName] = transaction[this.logActionEntityName]({identifier: method});
            data[this.logEntityEntityName] = transaction[this.logEntityEntityName]({identifier: entityName});
            data.userId = model.getUserId();

            if (primaryKeys.length === 1 || primaryKeys.length === 2) {
                if (primaryKeys[0].jsTypeMapping === 'number') data.affectedId = model[primaryKeys[0].name];
                else data.affectedStringId = model[primaryKeys[0].name];
            }

            if (primaryKeys.length === 2) {
                if (primaryKeys[1].jsTypeMapping === 'number') data.affectedSecondaryId = model[primaryKeys[1].name];
            }

            return new (transaction[this.logEntityName])(data).save().then((logRecord) => {
                if (entity.groups.length) {
                    return Promise.all(entity.groups.map((group) => {
                        return this.createGroupLogs({
                            group: this.groups.get(dbName).get(group.identifier)
                            , via: group.via
                        }, entityName, transaction, logRecord, definition, model);
                    }));
                } else return Promise.resolve();
            }).then(() => Promise.resolve());
        }





        createGroupLogs(group, entityName, transaction, logRecord, sourceDefinition, sourceModel) {

            // get the id of the target of the group
            const via = group.via.length ? group.via.split('.').reverse() : [];


            const buildQuery = (query, index) => {
                if (via.length > index) return buildQuery(query.get(via[index]), index+1);
                else return query;
            };

            const filter = {};
            sourceDefinition.primaryKeys.forEach((key) => filter[key] = sourceModel[key]);

            const targetQueryEntity = transaction[group.group.targetEntity.identifier];
            const targetDefinition = targetQueryEntity.getDefinition();
            const primaryKeys = targetDefinition.primaryKeys.map(name => targetDefinition.columns[name]);


            return buildQuery(targetQueryEntity(targetDefinition.primaryKeys), 0).get(entityName, filter).raw().find().then((records) => {
                return Promise.all(records.map((affectedRecord) => {
                    const data = {
                        data: {
                              fields: JSON.parse(logRecord.data).fields
                            , sourceEntity: {
                                  name: entityName
                                , via: group.via
                            }
                        }
                        , id_eventLogEntity: group.group.targetEntityId
                        , id_eventLogAction: logRecord.id_eventLogAction
                        , userId: logRecord.userId
                    };


                    if (primaryKeys.length === 1 || primaryKeys.length === 2) {
                        if (primaryKeys[0].jsTypeMapping === 'number') data.affectedId = affectedRecord[primaryKeys[0].name];
                        else data.affectedStringId = affectedRecord[primaryKeys[0].name];
                    }

                    if (primaryKeys.length === 2) {
                        if (primaryKeys[1].jsTypeMapping === 'number') data.affectedSecondaryId = affectedRecord[primaryKeys[1].name];
                    }

                    return new (transaction[this.logEntityName])(data).save();
                }));
            });
        }




        /*
         * lets the user set the id on the model
         */
        setUserId(id) {
            this._userId = id;
        }


        getUserId() {
            return this._userId;
        }


        /*
         * checks if this extension should be used on the current model
         * methods and properties may be installed on the models prototype
         */
        applyModelMethods(definition, classDefinition) {

            // add this method to the model
            classDefinition.setUserId = this.setUserId;
            classDefinition.getUserId = this.getUserId;
        }

    };
})();
