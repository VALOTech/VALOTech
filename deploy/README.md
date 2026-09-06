# Deploy

Empty on purpose. Where the application runs is unanswered — see
[`INFRA-DEC-03`](../docs/decisions-log.md#INFRA-DEC-03) — and a deployment
artifact written before that answer would describe a host nobody chose.

What is true today: the gateway is a static site served by GitHub Pages from
`main`, fronted by Cloudflare, and nothing in this repository configures that. It
is repository settings and DNS, both of which are the owner's.

When the decision lands, this directory takes the compose file or the manifests
for the chosen host, plus a `README` that says how to roll back and how long it
takes. The operator item is [`OPS-HOSTING`](../docs/operator-checklist.md#OPS-HOSTING).
