// The v1 interview question catalog. Source of truth: SPEC.md §5.2.
//
// Wording here may be polished, but the metric effects MUST NOT change
// without updating SPEC.md first — this is the implementation contract.

import type { MetricEffect, Option, Question } from "./types.js";

export const CATALOG_VERSION = "1.0";

const SKIP_OPTION: Option = {
  id: "skip",
  label: "Skip — not sure / doesn't apply",
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
      '"Only from inside our network" is scored as Adjacent (MAV:A) — a documented approximation. CVSS actually defines Adjacent as a shared physical/logical network (e.g. Bluetooth, same broadcast domain), not "requires a foothold on our network first," which is the intent here.',
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
    options: withSkip([
      {
        id: "basic",
        label: "Nothing beyond the basics",
        description: "Standard firewall rules, nothing special",
        effects: [],
      },
      {
        id: "layered",
        label: "Yes — meaningful extra layers",
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
    options: withSkip([
      {
        id: "anyone",
        label: "Anyone — no login needed",
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
    question: "Do people actively work on these systems — opening links, files, or email on them?",
    whyWeAsk: "Many attacks need a human to click something. Headless servers don't click.",
    finePrint:
      "CVSS has no value for \"user interaction impossible\" — this caps interaction-dependent exploits at the hardest interaction level the spec allows (Active/Required), it cannot zero them out entirely.",
    options: withSkip([
      {
        id: "interactive",
        label: "Yes — people use them interactively",
        description: "Workstations, kiosks, terminals people browse/read mail on",
        effects: [],
      },
      {
        id: "headless",
        label: "No — headless / unattended",
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
    options: withSkip([
      {
        id: "stepping_stone",
        label: "Yes — it's a stepping stone to critical systems",
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
        label: "No — a dead end",
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
      "Medical devices, industrial control, vehicles, building systems — when software failure can hurt people, the score should reflect it.",
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
    whyWeAsk: "v4 supplemental (Recovery), display-only — never changes a score.",
    options: withSkip([
      {
        id: "automatic",
        label: "Automatically — rebuilt from pipeline/IaC, restores itself",
        effects: [fx("4.0", "R", "A", "override")],
      },
      {
        id: "manual",
        label: "Manually — documented process, people do the work",
        effects: [fx("4.0", "R", "U", "override")],
      },
      {
        id: "uncertain",
        label: "Uncertain — we'd be improvising, or we'd need outside help",
        effects: [fx("4.0", "R", "I", "override")],
      },
    ]),
  },
  {
    id: "value_density",
    order: 11,
    question: "Does one system here control a lot of resources, or is each box just one small piece?",
    whyWeAsk: "v4 supplemental (Value Density), display-only — never changes a score.",
    options: withSkip([
      {
        id: "concentrated",
        label: "Concentrated — one system = many resources (hypervisor, DB server, domain controller)",
        effects: [fx("4.0", "V", "C", "override")],
      },
      {
        id: "diffuse",
        label: "Diffuse — each system is one small unit of a larger whole",
        effects: [fx("4.0", "V", "D", "override")],
      },
    ]),
  },
  {
    id: "patch_effort",
    order: 12,
    question: "How disruptive is it to patch or update systems at this location?",
    whyWeAsk: "v4 supplemental (Vulnerability Response Effort), display-only — never changes a score.",
    options: withSkip([
      {
        id: "easy",
        label: "Easy — routine, low-risk, quick",
        effects: [fx("4.0", "RE", "L", "override")],
      },
      {
        id: "moderate",
        label: "Moderate — scheduling, testing, some coordination",
        effects: [fx("4.0", "RE", "M", "override")],
      },
      {
        id: "hard",
        label: "Hard — downtime windows, vendor involvement, regulatory hoops",
        effects: [fx("4.0", "RE", "H", "override")],
      },
    ]),
  },
];

export const CATALOG: readonly Question[] = questions.sort((a, b) => a.order - b.order);
