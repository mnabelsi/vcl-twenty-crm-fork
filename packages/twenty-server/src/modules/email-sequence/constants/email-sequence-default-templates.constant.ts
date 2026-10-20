import {
  type EmailSequenceStepKey,
  type EmailSequenceTrack,
} from 'twenty-shared/types';

type DefaultTemplate = {
  // null subject means the step is sent as a reply in the existing thread
  subject: string | null;
  body: string;
};

const CLOSE_OUT_BODY = `Hi {{firstName}},

I have not heard back, so I will assume the timing is not right and close this thread for now.

If this becomes a priority for {{company}} later in the year, I would be glad to help. You can reply to this email at any time.`;

export const EMAIL_SEQUENCE_DEFAULT_TEMPLATES: Record<
  EmailSequenceTrack,
  Record<EmailSequenceStepKey, DefaultTemplate>
> = {
  C_SUITE: {
    STEP_1: {
      subject: 'AI at {{company}}: moving past the pilot stage',
      body: `Hi {{firstName}},

Most leadership teams I speak with in the region have approved AI tools, yet only a small group of employees use them in their daily work. The investment is in place; the return depends on workforce capability.

{{industryLine}}

At VCL we run the AI Adoption Programme: a short diagnostic of where your teams stand, followed by a development programme for leaders, managers and professionals, measured on knowledge, skills and behaviours.

Would it be useful to compare notes on where {{company}} is today?`,
    },
    STEP_2_OPENED: {
      subject: null,
      body: `Hi {{firstName}},

A quick follow-up with one data point. In our recent programmes, the largest gap we measured sat in confidence and judgement: people had access to the tools but used them for simple tasks only.

Our diagnostic shows this gap by team and role within two weeks, so leadership can decide where to invest first.

Happy to share a sample diagnostic report if helpful.`,
    },
    STEP_2_NOT_OPENED: {
      subject: '{{firstName}}, a question on AI adoption at {{company}}',
      body: `Hi {{firstName}},

Short question: how many people at {{company}} use AI tools in their weekly work today, and how do you measure it?

{{industryLine}}

Most organisations we work with find this hard to answer with confidence. We help leadership teams set a clear baseline and a plan to raise it.

Worth a 20-minute conversation?`,
    },
    STEP_3: {
      subject: null,
      body: `Hi {{firstName}},

To make this concrete: we offer a free 20-minute AI Gap Screening for leadership teams. We look at three areas (strategy, workforce capability and governance), and you leave with a one-page view of where the gaps are.

No preparation is needed on your side. Would a slot next week work?`,
    },
    STEP_4: { subject: null, body: CLOSE_OUT_BODY },
  },
  HR: {
    STEP_1: {
      subject: "Measuring AI skills across {{company}}'s workforce",
      body: `Hi {{firstName}},

AI is changing job roles faster than job descriptions and competency models can keep up. HR teams are now asked a hard question: which AI skills do our people have today, and which do they need next?

{{industryLine}}

VCL's AI Adoption Programme gives HR a clear answer. We assess AI competence across three tiers (leaders, managers and professionals) and build development plans measured on knowledge, skills and behaviours.

Would it help to see how other HR teams in the region are approaching this?`,
    },
    STEP_2_OPENED: {
      subject: null,
      body: `Hi {{firstName}},

One thing HR leaders often tell us: AI training was delivered and attendance was high, yet nobody could show what changed afterwards.

We designed our programme around that problem. Every module has a clear knowledge, skills and behaviour outcome, so you can report progress to leadership in the same language you use for other competencies.

I can share a sample competency report if useful.`,
    },
    STEP_2_NOT_OPENED: {
      subject: 'AI competence in your competency framework',
      body: `Hi {{firstName}},

Quick question: does {{company}}'s competency framework include AI skills today?

{{industryLine}}

We help HR teams add AI competence to their frameworks and measure it by role. Worth a short call to compare approaches?`,
    },
    STEP_3: {
      subject: null,
      body: `Hi {{firstName}},

A concrete next step: we offer a free 20-minute AI Gap Screening for HR leaders. We review your workforce tiers and current frameworks at a high level, and you leave with a one-page view of AI skill gaps by tier.

Would a slot next week suit you?`,
    },
    STEP_4: { subject: null, body: CLOSE_OUT_BODY },
  },
  L_AND_D: {
    STEP_1: {
      subject: 'An AI curriculum built on the UK AISfB framework',
      body: `Hi {{firstName}},

Many L&D teams are asked to "upskill everyone on AI" without a clear framework or a way to measure results.

{{industryLine}}

VCL's AI Adoption Programme is built on the UK AI Skills for Business (AISfB) Competency Framework. Learning runs in three phases (Activate, Apply, Anchor) for non-technical staff, and every module is measured on knowledge, skills and behaviours.

Would it be useful to walk through the curriculum structure together?`,
    },
    STEP_2_OPENED: {
      subject: null,
      body: `Hi {{firstName}},

A quick follow-up. The part L&D teams usually value most is the Anchor phase: guided practice on real work tasks after the sessions, so new habits hold once the classroom ends.

I can send you the programme outline and a sample module if helpful.`,
    },
    STEP_2_NOT_OPENED: {
      subject: 'AI learning paths for {{company}}',
      body: `Hi {{firstName}},

How is {{company}} approaching AI learning for non-technical staff this year?

{{industryLine}}

We provide a ready AI curriculum, mapped to the UK AISfB framework, that L&D teams can deliver with us or adapt. Worth 20 minutes to compare notes?`,
    },
    STEP_3: {
      subject: null,
      body: `Hi {{firstName}},

To make this practical: we offer a free 20-minute AI Gap Screening for L&D teams. We look at your current AI learning offer and audiences, and you leave with a one-page gap view and a suggested learning path by tier.

Would next week work for a short call?`,
    },
    STEP_4: { subject: null, body: CLOSE_OUT_BODY },
  },
  DIGITAL: {
    STEP_1: {
      subject: 'AI use cases at {{company}}: getting past the pilot',
      body: `Hi {{firstName}},

Most digital teams in the region have several AI use cases in pilot, and few reach production. The blockers tend to be the same four: choosing a model upfront, Data Residency and Sovereignty, handling sensitive information, and the effort of building agents.

{{industryLine}}

VCL works with Semtuk, an AI platform that handles these four points out of the box, and pairs it with an adoption programme so people use what you deploy.

Would a short call be worthwhile to see if this fits your roadmap?`,
    },
    STEP_2_OPENED: {
      subject: null,
      body: `Hi {{firstName}},

A quick follow-up. Semtuk lets your teams switch between models without rebuilding, keeps data in the region you choose, and lets business users build agents without code. Integrations with core systems such as SAP and Salesforce are also in place or under way.

Happy to arrange a 30-minute demo with your team.`,
    },
    STEP_2_NOT_OPENED: {
      subject: 'Moving AI pilots into production at {{company}}',
      body: `Hi {{firstName}},

How many AI pilots does {{company}} have running today, and how many are in daily use?

{{industryLine}}

We help digital teams move use cases into production on a platform that handles model choice, Data Residency and Sovereignty, and sensitive data by design. Worth a short call?`,
    },
    STEP_3: {
      subject: null,
      body: `Hi {{firstName}},

A concrete next step: a free 20-minute AI Gap Screening for your digital team. We review your current use cases and platform choices, and you leave with a one-page view of what is holding them back from production.

Would next week suit you?`,
    },
    STEP_4: { subject: null, body: CLOSE_OUT_BODY },
  },
};
