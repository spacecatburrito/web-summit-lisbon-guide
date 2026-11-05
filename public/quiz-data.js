// Quiz definition. Option ids are the tag vocabulary used in data/events.json (see data/schema.md).
export const QUIZ = [
  { id: "role", text: "Who are you this week?", multi: false, options: [
    { id: "founder", label: "Founder" },
    { id: "product", label: "Product or tech" },
    { id: "investor", label: "Investor" },
    { id: "sales", label: "Sales, BD or marketing" },
    { id: "recruiter", label: "Recruiter or people" },
    { id: "corporate", label: "Corporate or bank" },
    { id: "other", label: "Something else" },
  ] },
  { id: "goal", text: "What do you want most from the week?", multi: false, options: [
    { id: "hire", label: "Hire" },
    { id: "get_hired", label: "Find a role" },
    { id: "cofounder", label: "Find a cofounder" },
    { id: "raise", label: "Raise money" },
    { id: "sell", label: "Meet customers or partners" },
    { id: "learn", label: "Learn" },
    { id: "party", label: "Have fun" },
  ] },
  { id: "sector", text: "Your field?", multi: false, options: [
    { id: "fintech", label: "Fintech or payments" },
    { id: "crypto", label: "Crypto or web3" },
    { id: "ai", label: "AI" },
    { id: "saas", label: "SaaS or B2B" },
    { id: "consumer", label: "Consumer" },
    { id: "any", label: "Other" },
  ] },
  { id: "badge", text: "Do you have a Web Summit badge?", multi: false, options: [
    { id: "yes", label: "Yes" },
    { id: "no", label: "No" },
  ] },
  { id: "days", text: "Which days are you in Lisbon?", multi: true, options: [
    { id: "d08", label: "Sun 8" },
    { id: "d09", label: "Mon 9" },
    { id: "d10", label: "Tue 10" },
    { id: "d11", label: "Wed 11" },
    { id: "d12", label: "Thu 12" },
    { id: "d13", label: "Fri 13" },
  ] },
  { id: "evenings", text: "Evenings?", multi: false, options: [
    { id: "party", label: "Up for parties" },
    { id: "drinks", label: "Networking drinks, home by 23" },
    { id: "day", label: "Mornings and daytime only" },
  ] },
  { id: "groups", text: "Any of these describe you?", multi: true, optional: true, options: [
    { id: "ru", label: "RU, UA or CEE speaker" },
    { id: "latam", label: "LATAM or Brazil ties" },
    { id: "women", label: "Women in tech events" },
    { id: "crypto_biz", label: "My business receives crypto or moves money across borders" },
    { id: "none", label: "None of these" },
  ] },
];

export const DAY_DATES = { d08: "2026-11-08", d09: "2026-11-09", d10: "2026-11-10", d11: "2026-11-11", d12: "2026-11-12", d13: "2026-11-13" };

if (typeof window !== "undefined") {
  window.WS26 = Object.assign(window.WS26 || {}, { QUIZ, DAY_DATES });
}
