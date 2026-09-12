# Deploy

Empty until `OPS-001` builds it. The host is **AWS**
([`INFRA-DEC-03`](../docs/decisions-log.md#INFRA-DEC-03)) and the shape is **ECS on
Fargate with RDS PostgreSQL** ([`INFRA-DEC-05`](../docs/decisions-log.md#INFRA-DEC-05),
hand-rolled Terraform or ECS Express Mode decided at build); this directory takes
that Terraform (`OPS-001/T1`), its remote state in S3 behind a lock table, plus a
`README` saying how to roll back and how long it takes.

What is true today: the gateway is still a static site served by GitHub Pages from
`main`, fronted by Cloudflare, and nothing in this repository configures that — it
is repository settings and DNS, both the owner's. `OPS-001` is the task that ends
the static site's tenure and moves the domain onto AWS, and the repository goes
private at that cutover ([`INFRA-DEC-04`](../docs/decisions-log.md#INFRA-DEC-04)).
The operator item is [`OPS-HOSTING`](../docs/operator-checklist.md#OPS-HOSTING).
