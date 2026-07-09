// The v1 interview question catalog. Source of truth: docs/SPEC01.md §5.2.
//
// Wording here may be polished, but the metric effects MUST NOT change
// without updating docs/SPEC01.md first — this is the implementation contract.

import type { MetricEffect, Option, Question } from "./types.js";

export const CATALOG_VERSION = "1.0";

const SKIP_OPTION: Option = {
  id: "skip",
  label: "Skip: not sure / doesn't apply",
  effects: [],
};

function withSkip(options: Option[]): Option[] {
  return [...options, SKIP_OPTION];
}

function fx(version: "4.0" | "3.1", metric: string, value: string, effect: "override" | "cap"): MetricEffect {
  return { version, metric, value, effect };
}

const questions: Question[] = [
  {
    id: "reachability",
    order: 1,
    question: "How could an outsider reach the systems at this location?",
    whyWeAsk:
      'A vulnerability that\'s exploitable "from the internet" only matters that way if the internet can actually reach you.',
    finePrint:
      '"Only from inside our network" is scored as Adjacent (MAV:A), a documented approximation. CVSS actually defines Adjacent as a shared physical/logical network (e.g. Bluetooth, same broadcast domain), not "requires a foothold on our network first," which is the intent here.',
    helpDetail: [
      "This is about the network path, not the internet in general. A public-facing web server and a database that only your VPN can reach face very different attackers, even running the exact same vulnerable software.",
      'A retail chain\'s point-of-sale terminals, reachable only over an internal store network, would pick "Only from inside our network." A cloud-hosted API with a public IP address would pick "Directly from the internet."',
      "Picking anything other than direct internet exposure means an attacker first needs a foothold somewhere else, which makes exploits that assume easy network access count for less here.",
    ],
    options: withSkip([
      {
        id: "internet",
        label: "Directly from the internet",
        description: "Public services, cloud instances with public IPs, anything an outsider can hit",
        effects: [],
      },
      {
        id: "internal_only",
        label: "Only from inside our network",
        description: "Reaching these systems first requires being on the internal network or VPN",
        effects: [fx("4.0", "MAV", "A", "cap"), fx("3.1", "MAV", "A", "cap")],
      },
      {
        id: "no_network",
        label: "No network path at all",
        description: "Air-gapped or console-only; you must physically be at the machine",
        effects: [fx("4.0", "MAV", "P", "cap"), fx("3.1", "MAV", "P", "cap")],
      },
    ]),
  },
  {
    id: "network_protections",
    order: 2,
    question: "Is there anything extra an attacker would have to get through before touching these systems?",
    whyWeAsk:
      "Layered defenses in front of a system make otherwise-easy attacks conditional on defeating those layers first.",
    helpDetail: [
      "This asks about real barriers standing between an attacker and the vulnerable system, not just \"do we have a firewall,\" since basic firewall rules are assumed everywhere already.",
      "A dev lab behind nothing but the office firewall would pick the basic option. A production database reachable only through a bastion host that requires MFA, on a segmented network, would pick the meaningful-extra-layers option.",
      "Meaningful extra layers make an attack that's normally easy count as harder here, since the attacker has to get through those layers first.",
    ],
    options: withSkip([
      {
        id: "basic",
        label: "Nothing beyond the basics",
        description: "Standard firewall rules, nothing special",
        effects: [],
      },
      {
        id: "layered",
        label: "Yes: meaningful extra layers",
        description:
          "Jump host / bastion with MFA, strict allow-listing, network segmentation, application gateway in front",
        effects: [fx("4.0", "MAT", "P", "cap"), fx("3.1", "MAC", "H", "cap")],
      },
    ]),
  },
  {
    id: "accounts",
    order: 3,
    question: "Who can actually log in to or use these systems?",
    whyWeAsk:
      "Many exploits assume no account is needed. If everything here sits behind authentication, unauthenticated attacks get harder in practice.",
    helpDetail: [
      "This is about whether reaching the vulnerable service at all requires logging in first, not about how privileged that account needs to be (that's a separate concern CVSS doesn't ask about here).",
      "A public marketing website anyone can browse would pick the no-login option. An internal admin dashboard that requires SSO for every request would pick the account-required option; a system only IT staff can touch at all would pick administrators only.",
      "Requiring an account (even a low-privilege one) makes exploits that assume anonymous access count for less here, since the attacker needs valid credentials first.",
    ],
    options: withSkip([
      {
        id: "anyone",
        label: "Anyone: no login needed",
        description: "Public or anonymous access to the services in question",
        effects: [],
      },
      {
        id: "user_required",
        label: "A valid user account is required",
        description: "Every service requires standard-user authentication first (e.g., behind an authenticating proxy/SSO)",
        effects: [fx("4.0", "MPR", "L", "cap"), fx("3.1", "MPR", "L", "cap")],
      },
      {
        id: "admin_only",
        label: "Administrators only",
        description: "Only privileged/admin staff can access these systems at all",
        effects: [fx("4.0", "MPR", "H", "cap"), fx("3.1", "MPR", "H", "cap")],
      },
    ]),
  },
  {
    id: "human_use",
    order: 4,
    question: "Do people actively work on these systems, opening links, files, or email on them?",
    whyWeAsk: "Many attacks need a human to click something. Headless servers don't click.",
    finePrint:
      "CVSS has no value for \"user interaction impossible\": this caps interaction-dependent exploits at the hardest interaction level the spec allows (Active/Required), it cannot zero them out entirely.",
    helpDetail: [
      "This is about whether a real person sits at these systems doing everyday work, since some exploits need someone to open a malicious link, file, or attachment to trigger.",
      "Employee laptops and shared kiosks people browse the web on would pick the interactive option. A headless batch-processing server or a network appliance no one logs into interactively would pick headless.",
      "Marking a location as headless makes exploits that require a person to click something count for less here, since there's no one there to click.",
    ],
    options: withSkip([
      {
        id: "interactive",
        label: "Yes: people use them interactively",
        description: "Workstations, kiosks, terminals people browse/read mail on",
        effects: [],
      },
      {
        id: "headless",
        label: "No: headless / unattended",
        description: "Servers, appliances; no one browses or opens files on them",
        effects: [fx("4.0", "MUI", "A", "cap"), fx("3.1", "MUI", "R", "cap")],
      },
    ]),
  },
  {
    id: "confidentiality",
    order: 5,
    question: "If an attacker could read everything on these systems, how bad would that actually be?",
    whyWeAsk: 'A "steals all your data" vulnerability only matters if there\'s data worth stealing.',
    helpDetail: [
      "This is about what an attacker would actually learn if they could read every file, database row, and secret this location holds, not about how likely a breach is.",
      "A location handling customer records, payment details, or credentials would pick catastrophic. A dev lab seeded only with synthetic test data that never touches real secrets would pick \"there is genuinely nothing to read.\"",
      "The more severe your answer, the more this location's confidentiality impact counts toward the score; picking that there's genuinely nothing to read can zero out confidentiality-based exploits here entirely.",
    ],
    options: withSkip([
      {
        id: "catastrophic",
        label: "Catastrophic",
        description: "Regulated data, customer PII, credentials/secrets, trade secrets",
        effects: [fx("4.0", "CR", "H", "override"), fx("3.1", "CR", "H", "override")],
      },
      {
        id: "painful",
        label: "Painful but survivable",
        description: "Internal business data; embarrassing, not existential",
        effects: [fx("4.0", "CR", "M", "override"), fx("3.1", "CR", "M", "override")],
      },
      {
        id: "barely",
        label: "Barely matters",
        description: "Nothing sensitive lives here",
        effects: [fx("4.0", "CR", "L", "override"), fx("3.1", "CR", "L", "override")],
      },
      {
        id: "nothing",
        label: "There is genuinely nothing to read",
        description: "Synthetic/test data only; rebuilt from a pipeline; no secrets ever touch it",
        effects: [
          fx("4.0", "CR", "L", "override"),
          fx("4.0", "MVC", "N", "override"),
          fx("3.1", "CR", "L", "override"),
          fx("3.1", "MC", "N", "override"),
        ],
      },
    ]),
  },
  {
    id: "integrity",
    order: 6,
    question: "If an attacker could silently change anything on these systems, how bad would that be?",
    whyWeAsk: "Same idea as the last question, but for tampering instead of theft.",
    helpDetail: [
      "This is about undetected tampering: an attacker quietly editing records, configuration, or code here, not a loud outage.",
      "A system whose data feeds financial transactions or safety-critical decisions would pick catastrophic. A location rebuilt automatically on every deploy, where any tampering just gets wiped, would pick \"nothing needs to stay unmodified.\"",
      "The more severe your answer, the more this location's integrity impact counts toward the score; picking that nothing needs to stay unmodified can zero out tampering-based exploits here entirely.",
    ],
    options: withSkip([
      {
        id: "catastrophic",
        label: "Catastrophic",
        description: "Changes here corrupt money, safety decisions, or downstream systems",
        effects: [fx("4.0", "IR", "H", "override"), fx("3.1", "IR", "H", "override")],
      },
      {
        id: "painful",
        label: "Painful but survivable",
        description: "We'd have to clean up, but damage is contained",
        effects: [fx("4.0", "IR", "M", "override"), fx("3.1", "IR", "M", "override")],
      },
      {
        id: "barely",
        label: "Barely matters",
        description: "Nothing here needs to stay pristine",
        effects: [fx("4.0", "IR", "L", "override"), fx("3.1", "IR", "L", "override")],
      },
      {
        id: "nothing",
        label: "Nothing needs to stay unmodified",
        description: "Disposable; any change is wiped on the next automated rebuild",
        effects: [
          fx("4.0", "IR", "L", "override"),
          fx("4.0", "MVI", "N", "override"),
          fx("3.1", "IR", "L", "override"),
          fx("3.1", "MI", "N", "override"),
        ],
      },
    ]),
  },
  {
    id: "availability",
    order: 7,
    question: "If these systems went down right now, who would care, and how fast?",
    whyWeAsk: "An outage on a system nobody depends on is not the same as an outage on the checkout flow.",
    helpDetail: [
      "This is about how much it matters if these systems simply stopped responding right now, not how likely that is.",
      "A checkout service where every minute of downtime costs revenue would pick immediate serious impact. An idle, auto-rebuilt sandbox environment where an outage is genuinely invisible to anyone would pick \"nobody would notice.\"",
      "The more severe your answer, the more this location's availability impact counts toward the score; picking that nobody would notice can zero out denial-of-service-style exploits here entirely.",
    ],
    options: withSkip([
      {
        id: "immediate",
        label: "Immediate serious impact",
        description: "Revenue, operations, or safety depends on uptime",
        effects: [fx("4.0", "AR", "H", "override"), fx("3.1", "AR", "H", "override")],
      },
      {
        id: "annoying",
        label: "Annoying within a day or two",
        description: "People would notice and grumble; work continues",
        effects: [fx("4.0", "AR", "M", "override"), fx("3.1", "AR", "M", "override")],
      },
      {
        id: "barely",
        label: "Barely matters",
        description: "Days of downtime would be fine",
        effects: [fx("4.0", "AR", "L", "override"), fx("3.1", "AR", "L", "override")],
      },
      {
        id: "nobody",
        label: "Nobody would notice",
        description: "Auto-rebuilt / redundant / idle; downtime is invisible",
        effects: [
          fx("4.0", "AR", "L", "override"),
          fx("4.0", "MVA", "N", "override"),
          fx("3.1", "AR", "L", "override"),
          fx("3.1", "MA", "N", "override"),
        ],
      },
    ]),
  },
  {
    id: "blast_radius",
    order: 8,
    question:
      "If an attacker fully controlled one of these systems, could they reach or damage other important systems from it?",
    whyWeAsk: "A compromised low-value box on a flat network with your crown jewels is not a low-value compromise.",
    helpDetail: [
      "This is about what happens after the initial compromise: can an attacker pivot from this system to something more valuable, using shared credentials, flat networking, or trust relationships?",
      "A build agent that shares service-account credentials with your production cluster would pick the stepping-stone option. An isolated segment where nothing meaningful is reachable from it would pick \"a dead end.\"",
      "Being a stepping stone raises this location's score above what its own base severity would suggest, since the real damage happens downstream of it; a dead end lowers it, since a compromise here genuinely goes nowhere.",
    ],
    options: withSkip([
      {
        id: "stepping_stone",
        label: "Yes: it's a stepping stone to critical systems",
        description: "Shared credentials, flat network, manages or talks to critical infrastructure",
        effects: [
          fx("4.0", "MSC", "H", "override"),
          fx("4.0", "MSI", "H", "override"),
          fx("4.0", "MSA", "H", "override"),
          fx("3.1", "MS", "C", "override"),
        ],
      },
      {
        id: "normal",
        label: "Normal connectivity",
        description: "Typical network position, nothing special either way",
        effects: [],
      },
      {
        id: "dead_end",
        label: "No: a dead end",
        description: "Isolated segment; nothing meaningful is reachable from it",
        effects: [
          fx("4.0", "MSC", "N", "override"),
          fx("4.0", "MSI", "N", "override"),
          fx("4.0", "MSA", "N", "override"),
          fx("3.1", "MS", "U", "override"),
        ],
      },
    ]),
  },
  {
    id: "safety",
    order: 9,
    question: "Could tampering with or crashing these systems physically endanger anyone?",
    whyWeAsk:
      "Medical devices, industrial control, vehicles, building systems: when software failure can hurt people, the score should reflect it.",
    helpDetail: [
      "This asks about physical, real-world harm, not data loss or financial damage: could someone actually get hurt if these systems were tampered with or crashed?",
      "An infusion pump or a factory floor controller would answer yes. A back-office reporting server, where the worst case is a purely digital inconvenience, would answer no.",
      "Answering yes raises this location's score to reflect the safety stakes; answering no keeps the score purely about the digital consequences already captured by the other questions.",
    ],
    options: withSkip([
      {
        id: "yes",
        label: "Yes",
        description: "OT/ICS, medical, vehicular, life-safety-adjacent systems",
        effects: [
          fx("4.0", "S", "P", "override"),
          fx("4.0", "MSI", "S", "override"),
          fx("4.0", "MSA", "S", "override"),
        ],
      },
      {
        id: "no",
        label: "No",
        description: "Failure here is a purely digital problem",
        effects: [fx("4.0", "S", "N", "override")],
      },
    ]),
  },
  {
    id: "recovery",
    order: 10,
    question: "After a serious compromise or crash, how does this location get back to normal?",
    whyWeAsk: "v4 supplemental (Recovery), display-only: never changes a score.",
    helpDetail: [
      "This is display-only context for anyone reading the score later; it never changes the number itself.",
      "A containerized service rebuilt automatically from infrastructure-as-code would answer automatically. A legacy system that only comes back after a person follows a runbook by hand would answer manually; a location with no real recovery plan at all would answer uncertain.",
      "Whatever you pick here shows up alongside the score as extra context, so a reader understands not just how severe an exploit is, but how hard the location would be to recover if it happened.",
    ],
    options: withSkip([
      {
        id: "automatic",
        label: "Automatically: rebuilt from pipeline/IaC, restores itself",
        effects: [fx("4.0", "R", "A", "override")],
      },
      {
        id: "manual",
        label: "Manually: documented process, people do the work",
        effects: [fx("4.0", "R", "U", "override")],
      },
      {
        id: "uncertain",
        label: "Uncertain: we'd be improvising, or we'd need outside help",
        effects: [fx("4.0", "R", "I", "override")],
      },
    ]),
  },
  {
    id: "value_density",
    order: 11,
    question: "Does one system here control a lot of resources, or is each box just one small piece?",
    whyWeAsk: "v4 supplemental (Value Density), display-only: never changes a score.",
    helpDetail: [
      "This is display-only context for anyone reading the score later; it never changes the number itself.",
      "A hypervisor host, database server, or domain controller, where compromising one box hands over control of many resources, would answer concentrated. A fleet of near-identical worker nodes, where each one is just a small interchangeable piece, would answer diffuse.",
      "Whatever you pick here shows up alongside the score as extra context, so a reader understands how much is riding on any single compromised system at this location.",
    ],
    options: withSkip([
      {
        id: "concentrated",
        label: "Concentrated: one system = many resources (hypervisor, DB server, domain controller)",
        effects: [fx("4.0", "V", "C", "override")],
      },
      {
        id: "diffuse",
        label: "Diffuse: each system is one small unit of a larger whole",
        effects: [fx("4.0", "V", "D", "override")],
      },
    ]),
  },
  {
    id: "patch_effort",
    order: 12,
    question: "How disruptive is it to patch or update systems at this location?",
    whyWeAsk: "v4 supplemental (Vulnerability Response Effort), display-only: never changes a score.",
    helpDetail: [
      "This is display-only context for anyone reading the score later; it never changes the number itself.",
      "A stateless service that redeploys in minutes with no coordination needed would answer easy. A system that needs a scheduled downtime window and vendor involvement to patch would answer hard; something in between, needing testing and some coordination, would answer moderate.",
      "Whatever you pick here shows up alongside the score as extra context, so a reader understands not just how severe an exploit is, but how disruptive fixing it would actually be at this location.",
    ],
    options: withSkip([
      {
        id: "easy",
        label: "Easy: routine, low-risk, quick",
        effects: [fx("4.0", "RE", "L", "override")],
      },
      {
        id: "moderate",
        label: "Moderate: scheduling, testing, some coordination",
        effects: [fx("4.0", "RE", "M", "override")],
      },
      {
        id: "hard",
        label: "Hard: downtime windows, vendor involvement, regulatory hoops",
        effects: [fx("4.0", "RE", "H", "override")],
      },
    ]),
  },
];

export const CATALOG: readonly Question[] = questions.sort((a, b) => a.order - b.order);
