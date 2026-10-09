import { PUBLISH_CONFIDENCE, REVIEW_CONFIDENCE } from '@maize-bites/shared';
import type { ReactNode } from 'react';

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="text-lg font-bold text-michigan-blue">{title}</h2>
      <div className="mt-2 space-y-3 text-slate-700">{children}</div>
    </section>
  );
}

export function AboutPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="text-3xl font-extrabold tracking-tight text-michigan-blue">
        About Maize Bites
      </h1>
      <p className="mt-3 text-lg text-slate-700">
        Maize Bites shows free food on the University of Michigan campus: what's available right
        now, where it is on a map, and whether it's open to you.
      </p>

      <Section title="How it works">
        <ol className="list-decimal space-y-2 pl-5">
          <li>
            Every hour we read the public Happening @ Michigan event feed, and a few times a day the
            public Maize Pages feed.
          </li>
          <li>
            Keyword rules pick out events that might have food: pizza, refreshments, lunch provided,
            and so on.
          </li>
          <li>
            An AI classifier reads those events and extracts what food there is, who can attend, and
            dietary details, quoting the phrase from the listing it relied on.
          </li>
          <li>
            Events it's confident about ({Math.round(PUBLISH_CONFIDENCE * 100)}% or higher) appear
            here. Less certain ones ({Math.round(REVIEW_CONFIDENCE * 100)}–
            {Math.round(PUBLISH_CONFIDENCE * 100)}%) wait for a person to check.
          </li>
          <li>Locations are matched to campus buildings so events show up on the map.</li>
        </ol>
        <p className="mt-3">
          Free food is detected automatically: by keyword rules, and by the AI classifier when it is
          switched on. Either can be wrong. Check the listing before you make the trip, and use the
          report buttons on an event if we got it wrong.
        </p>
      </Section>

      <Section title="Data sources">
        <ul className="list-disc space-y-2 pl-5">
          <li>
            Events:{' '}
            <a
              className="font-medium text-michigan-blue underline underline-offset-2"
              href="https://events.umich.edu/"
            >
              Happening @ Michigan
            </a>{' '}
            public feed.
          </li>
          <li>
            Maps: ©{' '}
            <a
              className="font-medium text-michigan-blue underline underline-offset-2"
              href="https://www.openstreetmap.org/copyright"
            >
              OpenStreetMap
            </a>{' '}
            contributors, served by{' '}
            <a
              className="font-medium text-michigan-blue underline underline-offset-2"
              href="https://openfreemap.org/"
            >
              OpenFreeMap
            </a>
            . Building coordinates are also from OpenStreetMap.
          </li>
        </ul>
      </Section>

      <Section title="Dietary information">
        <p>
          Dietary tags come only from what the event listing says, extracted automatically, and can
          be incomplete or wrong. Hosts change menus. If you have an allergy or a strict dietary
          need, confirm with the host before eating.
        </p>
      </Section>

      <Section title="Good manners">
        <p>
          “Members only” and “RSVP required” badges mean exactly that. Please don't crash a club
          meeting for the pizza.
        </p>
      </Section>
    </div>
  );
}
