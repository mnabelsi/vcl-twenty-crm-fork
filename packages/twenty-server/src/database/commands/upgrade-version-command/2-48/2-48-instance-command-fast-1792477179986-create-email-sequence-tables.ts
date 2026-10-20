import { QueryRunner } from 'typeorm';

import { RegisteredInstanceCommand } from 'src/engine/core-modules/upgrade/decorators/registered-instance-command.decorator';
import { FastInstanceCommand } from 'src/engine/core-modules/upgrade/interfaces/fast-instance-command.interface';

@RegisteredInstanceCommand('2.48.0', 1792477179986)
export class CreateEmailSequenceTablesFastInstanceCommand implements FastInstanceCommand {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "core"."emailSequenceSetting" ("workspaceId" uuid NOT NULL, "id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "signature" text NOT NULL, "industryLines" jsonb NOT NULL, "timeZone" character varying NOT NULL, "sendDays" jsonb NOT NULL, "sendWindowStartHour" integer NOT NULL, "sendWindowEndHour" integer NOT NULL, "dailySendLimit" integer NOT NULL, "stepDelaysInDays" jsonb NOT NULL, "isOpenTrackingEnabled" boolean NOT NULL DEFAULT true, CONSTRAINT "IDX_EMAIL_SEQUENCE_SETTING_WORKSPACE_ID_UNIQUE" UNIQUE ("workspaceId"), CONSTRAINT "PK_EMAIL_SEQUENCE_SETTING" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "core"."emailSequenceTemplate" ("workspaceId" uuid NOT NULL, "id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "track" character varying NOT NULL, "stepKey" character varying NOT NULL, "subject" character varying, "body" text NOT NULL, CONSTRAINT "IDX_EMAIL_SEQUENCE_TEMPLATE_WORKSPACE_TRACK_STEP_UNIQUE" UNIQUE ("workspaceId", "track", "stepKey"), CONSTRAINT "PK_EMAIL_SEQUENCE_TEMPLATE" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "core"."emailSequenceEnrollment" ("workspaceId" uuid NOT NULL, "id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "personId" uuid NOT NULL, "personName" character varying NOT NULL, "firstName" character varying, "email" character varying NOT NULL, "companyName" character varying, "jobTitle" character varying, "track" character varying NOT NULL, "industry" character varying NOT NULL, "status" character varying NOT NULL, "nextStage" integer, "nextSendAt" TIMESTAMP WITH TIME ZONE, "lastStepKey" character varying, "lastSentAt" TIMESTAMP WITH TIME ZONE, "lastHeaderMessageId" character varying, "threadSubject" character varying, "connectedAccountId" uuid NOT NULL, "enrolledByUserWorkspaceId" uuid, "endedAt" TIMESTAMP WITH TIME ZONE, "lastError" text, "failedAttemptCount" integer NOT NULL DEFAULT '0', CONSTRAINT "PK_EMAIL_SEQUENCE_ENROLLMENT" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_EMAIL_SEQUENCE_ENROLLMENT_STATUS_NEXT_SEND_AT" ON "core"."emailSequenceEnrollment" ("status", "nextSendAt") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_EMAIL_SEQUENCE_ENROLLMENT_WORKSPACE_PERSON" ON "core"."emailSequenceEnrollment" ("workspaceId", "personId") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_EMAIL_SEQUENCE_ENROLLMENT_ACTIVE_PERSON_UNIQUE" ON "core"."emailSequenceEnrollment" ("workspaceId", "personId") WHERE "status" = 'ACTIVE'`,
    );
    await queryRunner.query(
      `CREATE TABLE "core"."emailSequenceMessage" ("workspaceId" uuid NOT NULL, "id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "enrollmentId" uuid NOT NULL, "stepKey" character varying NOT NULL, "subject" character varying NOT NULL, "sentAt" TIMESTAMP WITH TIME ZONE NOT NULL, "headerMessageId" character varying, "messageThreadId" uuid, "openCount" integer NOT NULL DEFAULT '0', "firstOpenedAt" TIMESTAMP WITH TIME ZONE, "lastOpenedAt" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_EMAIL_SEQUENCE_MESSAGE" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_EMAIL_SEQUENCE_MESSAGE_ENROLLMENT_ID" ON "core"."emailSequenceMessage" ("enrollmentId") `,
    );
    await queryRunner.query(
      `ALTER TABLE "core"."emailSequenceSetting" ADD CONSTRAINT "FK_ef8f2d17e2646518e8e5a949c95" FOREIGN KEY ("workspaceId") REFERENCES "core"."workspace"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "core"."emailSequenceTemplate" ADD CONSTRAINT "FK_7c3d28e0b4337ab0ad2307a72e0" FOREIGN KEY ("workspaceId") REFERENCES "core"."workspace"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "core"."emailSequenceEnrollment" ADD CONSTRAINT "FK_a91bfb9d43bc0fbd372de88134a" FOREIGN KEY ("workspaceId") REFERENCES "core"."workspace"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "core"."emailSequenceMessage" ADD CONSTRAINT "FK_369bb585edac3eefadecf32890a" FOREIGN KEY ("workspaceId") REFERENCES "core"."workspace"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "core"."emailSequenceMessage" ADD CONSTRAINT "FK_db6c907100c606a20362c1f1132" FOREIGN KEY ("enrollmentId") REFERENCES "core"."emailSequenceEnrollment"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "core"."emailSequenceMessage"`);
    await queryRunner.query(`DROP TABLE "core"."emailSequenceEnrollment"`);
    await queryRunner.query(`DROP TABLE "core"."emailSequenceTemplate"`);
    await queryRunner.query(`DROP TABLE "core"."emailSequenceSetting"`);
  }
}
