(function() {
    'use strict';

    process.argv.push('--related-sql');
    process.argv.push('--dev-orm');


    const log           = require('ee-log');
    const assert        = require('assert');
    const fs            = require('fs');
    const QueryContext  = require('related-query-context');
    const ORM           = require('related');



    const EventLog = require('../');
    let orm;
    let db;
    let extension;


    // sql for test db
    let sqlStatments = fs.readFileSync(__dirname+'/db.postgres.sql').toString().split(';').map(function(input){
        return input.trim().replace(/\n/gi, ' ').replace(/\s{2,}/g, ' ')
    }).filter(function(item){
        return item.length;
    });



    describe('Preparations', function() {
        it('load the orm', function() {
            var config;

            try {
                config = require('../config.js').db
            } catch(e) {
                config = [{
                      type              : 'postgres'
                    , database          : 'test'
                    , schema            : 'related_eventlog_test'
                    , hosts: [{
                          host      : 'localhost'
                        , username  : 'postgres'
                        , password  : ''
                        , maxConnections: 20
                        , pools     : ['write', 'read', 'master']
                    }]
                }];
            }

            orm = new ORM(config);
        });
    });



    describe('The EventLog Extension', function() {

        it('should not crash when instatiated', function() {
            extension = new EventLog();
        });


        it('should not crash when injected into the orm', function(done) {
            orm.use(extension);
            orm.load().then(() => done()).catch(done);
        });


        it('removing old data', function(done) {
            db = orm.related_eventlog_test;
            db.eventLogGroup_eventLogEntity().delete().then(() => {
                return db.eventLogGroup().delete();
            }).then(() => {
                return db.eventLog().delete();
            }).then(() => {
                return db.eventLogAction({identifier: 'testAction'}).delete();
            }).then(() => {
                return db.eventLogAction({identifier: 'invalidAction'}).update({identifier: 'import'});
            }).then(() => done()).catch(done);
        });


        it('inserting test data', function(done) {
            new db.eventLog({
                  eventLogAction: db.eventLogAction({identifier: 'import'})
                , eventLogEntity: db.eventLogEntity({identifier: 'eventLogAction'})
                , affectedId: 69
            }).save().then(() => done()).catch(done);
        });


        it('wait', function(done) {
            db = orm.related_eventlog_test;
            setTimeout(done, 500);
        });


        it('insert test', function(done) {
            new db.eventLogGroup({
                  identifier: 'eventLogGroupTest'
                , targetEntity: db.eventLogEntity({identifier: 'eventLogAction'})
            }).save().then(() => {
                return db.eventLog('*').fetchEventLogAction({
                    identifier: 'insert'
                }).fetchEventLogEntity({
                    identifier: 'eventLogGroup'
                }).find().then((logs) => {
                    assert(logs);
                    assert.equal(logs.length, 1);
                    done();
                });
            }).catch(done);
        });


        it('update test', function(done) {
            db.eventLogGroup({identifier: 'eventLogGroupTest'}).findOne().then((group) => {
                group.identifier = 'renamed';
                return group.save().then(() => {
                    return db.eventLog('*').fetchEventLogAction({
                        identifier: 'update'
                    }).fetchEventLogEntity({
                        identifier: 'eventLogGroup'
                    }).find().then((logs) => {
                        assert(logs);
                        assert.equal(logs.length, 1);
                        done();
                    });
                });
            }).catch(done);
        });


        it('delete test', function(done) {
            db.eventLogGroup({identifier: 'renamed'}).findOne().then((group) => {
                return group.delete().then(() => {
                    return db.eventLog('*').fetchEventLogAction({
                        identifier: 'delete'
                    }).fetchEventLogEntity({
                        identifier: 'eventLogGroup'
                    }).find().then((logs) => {
                        assert(logs);
                        assert.equal(logs.length, 1);
                        done();
                    });
                });
            }).catch(done);
        });


        it('remote update test', function(done) {
            new db.eventLogGroup({
                  identifier: 'remote'
                , eventLogGroup_eventLogEntity: new db.eventLogGroup_eventLogEntity({
                      eventLogEntity: db.eventLogEntity({identifier: 'eventLogAction'})
                    , via: 'eventLog.eventLogEntity'
                })
                , targetEntity: db.eventLogEntity({identifier: 'eventLogGroup'})
            }).save().then(() => {
                extension.reload();

                setTimeout(() => {
                    db.eventLogAction({
                        identifier: 'import'
                    }).findOne().then((action) => {
                        action.identifier = 'invalidAction';
                        return action.save();
                    }).then(() => {
                        return db.eventLog('*', {
                            data: db.getORM().jsonValue('sourceEntity.name', 'eventLogAction')
                        }).fetchEventLogAction({
                            identifier: 'update'
                        }).fetchEventLogEntity({
                            identifier: 'eventLogGroup'
                        }).find().then((logs) => {
                            assert(logs);
                            assert.equal(logs.length, 1);
                            done();
                        });
                    }).catch(done);
                }, 500);
            }).catch(done);
        });



        it('custom event', function(done) {
            db.addEventLog('eventLogGroup', 'delete', {
                  userId: 1
                , id: 69
                , fields: ['some', 'fields']
                , sourceEntity: 'reddit'
                , via: 'hacker.news'
            }).then(() => {
                return db.eventLog('*', {
                    data: db.getORM().jsonValue('sourceEntity.name', 'reddit')
                }).fetchEventLogAction({
                    identifier: 'delete'
                }).fetchEventLogEntity({
                    identifier: 'eventLogGroup'
                }).find().then((logs) => {
                    assert(logs);
                    assert.equal(logs.length, 1);
                    done();
                });
            }).catch(done);
        });
    });
})();
