import { PUBLISH_CONFIDENCE, REVIEW_CONFIDENCE } from '@maize-bites/shared';
import { ArrowRight, Rss, ScanSearch, Utensils, type LucideIcon } from 'lucide-react';
import { Fragment, type ReactNode } from 'react';
import { Link } from 'react-router';
import { linkClass } from '../components/forms';
import { buttonClass } from '../components/ui/button-class';

// Tinted like the meal tiles in the list, so the page belongs to the same product.
const STEPS: { icon: LucideIcon; tint: string; title: string; text: string }[] = [
  {
    icon: Rss,
    tint: 'bg-meal-drinks text-meal-drinks-ink',
    title: 'Sources',
    text: 'Every hour we read the public Happening @ Michigan feed, and a few times a day the public Maize Pages feed.',
  },
  {
    icon: ScanSearch,
    tint: 'bg-meal-dinner text-meal-dinner-ink',
    title: 'Classifier',
    text: 'Each listing is checked for free food: what it is, who can come, dietary details, and the exact phrase that says so.',
  },
  {
    icon: Utensils,
    tint: 'bg-meal-lunch text-meal-lunch-ink',
    title: 'You',
    text: 'Confident finds show up here within the hour, on the list and the map, most urgent first.',
  },
];

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-10">
      <h2 className="text-lg font-semibold text-ink">{title}</h2>
      <div className="mt-2 space-y-3 text-ink-2">{children}</div>
    </section>
  );
}

export function AboutPage() {
  const publish = Math.round(PUBLISH_CONFIDENCE * 100);
  const review = Math.round(REVIEW_CONFIDENCE * 100);
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="font-display text-[2rem] leading-9 font-bold tracking-[-0.02em] text-ink">
        Free food, found for you.
      </h1>
      <p className="mt-3 max-w-2xl text-base leading-6 text-ink-2">
        Maize Bites shows the free food on the University of Michigan campus: what's out right now,
        where it is, and whether it's open to you. It isn't run by or affiliated with the
        university.
      </p>

      <section aria-labelledby="how" className="mt-10">
        <h2 id="how" className="text-lg font-semibold text-ink">
          How it works
        </h2>
        <ol className="mt-4 grid items-stretch gap-3 sm:grid-cols-[1fr_auto_1fr_auto_1fr]">
          {STEPS.map((step, i) => (
            <Fragment key={step.title}>
              {i > 0 && (
                <li aria-hidden="true" className="hidden items-center text-ink-3 sm:flex">
                  <ArrowRight className="size-5" />
                </li>
              )}
              <li className="rounded-card border border-line bg-card p-4 shadow-card">
                <span className={`grid size-10 place-items-center rounded-xl ${step.tint}`}>
                  <step.icon aria-hidden="true" className="size-[1.125rem]" strokeWidth={1.75} />
                </span>
                <h3 className="mt-3 text-base font-semibold text-ink">
                  <span className="tabular mr-1.5 text-ink-3">{i + 1}</span>
                  {step.title}
                </h3>
                <p className="mt-1 text-sm text-ink-2">{step.text}</p>
              </li>
            </Fragment>
          ))}
        </ol>
      </section>

      <Section title="How sure is it?">
        <p>
          Free food is detected automatically: by keyword rules, and by an AI classifier when it is
          switched on. Listings it's confident about ({publish}% or higher) appear on the site. Less
          certain ones ({review}–{publish}%) wait for a person to check. Either can be wrong, so
          look at the listing before you make the trip, and use the report buttons on an event if we
          got it wrong.
        </p>
        <p>
          Locations are matched to campus buildings so events land on the map. An event whose
          location we couldn't match is still in the list.
        </p>
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

      <Section title="Privacy">
        <p>
          We count visits so we know whether the site is useful, without cookies, without storing
          anything in your browser, and without third-party trackers. Each page view records the
          page (never the query string), the site that linked you here, whether the screen is a
          phone's, and whether you were signed in, but not who you are.
        </p>
        <p>
          To tell visitors apart within a day, the server mixes your IP address and browser name
          with a random value that changes every day, and keeps only the scrambled result. Your IP
          address and browser details are never stored, and each day's random value is deleted two
          days later, so a visit can't be traced back to you or linked to another day. Visits from
          browsers with Do Not Track or Global Privacy Control turned on aren't counted at all.
        </p>
      </Section>

      <Section title="Data sources">
        <ul className="list-disc space-y-2 pl-5">
          <li>
            Events:{' '}
            <a className={linkClass} href="https://events.umich.edu/">
              Happening @ Michigan
            </a>{' '}
            and{' '}
            <a className={linkClass} href="https://maizepages.umich.edu/">
              Maize Pages
            </a>{' '}
            public feeds.
          </li>
          <li>
            Maps: ©{' '}
            <a className={linkClass} href="https://www.openstreetmap.org/copyright">
              OpenStreetMap
            </a>{' '}
            contributors, served by{' '}
            <a className={linkClass} href="https://openfreemap.org/">
              OpenFreeMap
            </a>
            . Building coordinates are also from OpenStreetMap.
          </li>
        </ul>
      </Section>

      <div className="mt-10 flex flex-wrap gap-2">
        <Link to="/" className={buttonClass({ variant: 'primary' })}>
          See what's out now
        </Link>
        <Link to="/alerts" className={buttonClass({ variant: 'secondary' })}>
          Get alerts
        </Link>
      </div>
    </div>
  );
}
