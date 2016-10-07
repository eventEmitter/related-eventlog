

DROP SCHEMA IF EXISTS "related_eventlog_test" CASCADE;
CREATE SCHEMA "related_eventlog_test";

set search_path to "related_eventlog_test";


CREATE TABLE "related_eventlog_test"."eventLogAction" (
      "id"                      serial NOT NULL
    , "identifier"              varchar(100) not null
    , CONSTRAINT "eventLogAction_pk"
        PRIMARY KEY ("id")
    , constraint "eventLogAction_unique_identifier"
        unique ("identifier")
);

CREATE TABLE "related_eventlog_test"."eventLogEntity" (
      "id"                      serial NOT NULL
    , "identifier"              varchar(100) not null
    , CONSTRAINT "eventLogEntity_pk"
        PRIMARY KEY ("id")
    , constraint "eventLogEntity_unique_identifier"
        unique ("identifier")
);

CREATE TABLE "related_eventlog_test"."eventLogGroup" (
      "id"                      serial NOT NULL
    , "identifier"              varchar(100) not null
    , "id_eventLogEntity"       int not null
    , CONSTRAINT "eventLogGroup_pk"
        PRIMARY KEY ("id")
    , constraint "eventLogGroup_unique_identifier"
        unique ("identifier")
    , constraint "eventLogGroup_eventLogEntity"
        foreign key ("id_eventLogEntity")
        references "eventLogEntity"("id")
        on update cascade
        on delete restrict
);

CREATE TABLE "related_eventlog_test"."eventLogGroup_eventLogEntity" (
      "id_eventLogGroup"        int NOT NULL
    , "id_eventLogEntity"       int not null
    , "via"                     varchar(1000) not null
    , CONSTRAINT "eventLogGroup_eventLogEntity_pk"
        PRIMARY KEY ("id_eventLogGroup", "id_eventLogEntity")
    , constraint "eventLogGroup_eventLogEntity_eventLogGroup"
        foreign key ("id_eventLogGroup")
        references "eventLogGroup"("id")
        on update cascade
        on delete restrict
    , constraint "eventLogGroup_eventLogEntity_eventLogEntity"
        foreign key ("id_eventLogEntity")
        references "eventLogEntity"("id")
        on update cascade
        on delete restrict
);



CREATE TABLE "related_eventlog_test"."eventLog" (
      "id"                      bigserial NOT NULL
    , "id_eventLogAction"       int not null
    , "id_eventLogEntity"       int not null
    , "affectedId"              int
    , "affectedSecondaryId"     int
    , "affectedStringId"        varchar(200)
    , "userId"                  int
    , "data"          json
    , "created"                 timestamp without time zone not null default now()
    , "updated"                 timestamp without time zone not null default now()
    , "deleted"                 timestamp without time zone
    , CONSTRAINT "eventLog_event" PRIMARY KEY ("id")
    , constraint "eventLog_ensureAffectedId"
        check (("affectedId" is null and "affectedStringId" is not null)
        or ("affectedId" is not null and "affectedStringId" is null))
    , constraint "eventLog_eventLogAction"
        foreign key ("id_eventLogAction")
        references "eventLogAction"("id")
        on update cascade
        on delete restrict
    , constraint "eventLog_eventLogEntity"
        foreign key ("id_eventLogEntity")
        references "eventLogEntity"("id")
        on update cascade
        on delete restrict
);




insert into "eventLogEntity" ("identifier") values ('eventLogGroup');
insert into "eventLogEntity" ("identifier") values ('eventLogAction');

insert into "eventLogAction" ("identifier") values ('update');
insert into "eventLogAction" ("identifier") values ('insert');
insert into "eventLogAction" ("identifier") values ('delete');
insert into "eventLogAction" ("identifier") values ('import');