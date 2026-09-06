# VALO Tech — the commands this repository actually has.
#
# A target exists here when something in the tree needs it. The siblings carry
# a hundred and forty targets because they carry a hundred and forty things to
# check; a target that checks nothing has only ever passed.

.DEFAULT_GOAL := help
SHELL := /bin/sh

PYTHON ?= python
NODE   ?= node
PORT   ?= 3101

.PHONY: help
help: ## Show this help
	@echo "VALO Tech"
	@echo ""
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) \
		| awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-18s\033[0m %s\n", $$1, $$2}'
	@echo ""
	@echo "The gateway is a static site: 'make serve' and open the port."

# --- The static gateway ---------------------------------------------------

.PHONY: serve
serve: ## Serve the gateway locally with no-store headers, on $(PORT)
	@echo "Serving on http://127.0.0.1:$(PORT) with Cache-Control: no-store"
	@echo "A dev server without cache headers makes a browser run a file you"
	@echo "are no longer editing, which has cost this repository two wrong"
	@echo "conclusions. That is why this target exists rather than http.server."
	@$(PYTHON) scripts/serve.py $(PORT)

# --- Gates ----------------------------------------------------------------

.PHONY: check
check: check-site check-decisions check-designs check-tasks check-roadmap check-identifiers check-log check-refs ## Run every gate this repository has

.PHONY: check-site
check-site: check-copy check-brand check-comments check-stream-guard ## Only the gates that guard what main publishes

.PHONY: check-copy
check-copy: ## The served English copy still matches the dictionary
	@$(NODE) scripts/sync-static-copy.mjs --check

.PHONY: check-brand
check-brand: ## The brand kit still publishes the stylesheet's own values
	@$(PYTHON) scripts/check-brand-tokens.py

.PHONY: check-decisions
check-decisions: ## The decision register holds its contract
	@$(PYTHON) scripts/validate-decisions.py

.PHONY: check-designs
check-designs: ## Design frontmatter is coherent and its codes resolve
	@$(PYTHON) scripts/validate-designs.py --strict

.PHONY: check-tasks
check-tasks: ## The ledger matches the designs; evidence resolves; blockers still block
	@$(PYTHON) scripts/sync-tasks-from-designs.py
	@$(PYTHON) scripts/check-evidence-citation.py
	@$(PYTHON) scripts/check-deferral-maturity.py
	@$(PYTHON) scripts/check-review-refer-to.py

.PHONY: fix-symmetry
fix-symmetry: ## Write the missing half of every design dependency edge
	@$(PYTHON) scripts/fix-design-symmetry.py

.PHONY: sync-tasks
sync-tasks: ## Add a ledger row for every design task that has none
	@$(PYTHON) scripts/sync-tasks-from-designs.py --write

.PHONY: check-roadmap
check-roadmap: ## The roadmap, the ledger and the design graph describe one project
	@$(PYTHON) scripts/validate-roadmap.py

.PHONY: check-identifiers
check-identifiers: ## No code was minted twice against origin/development
	@$(PYTHON) scripts/check-identifier-allocation.py

.PHONY: check-comments
check-comments: ## No bare deferral marker and no history prose in a comment
	@$(PYTHON) scripts/check-comments.py

.PHONY: check-stream-guard
check-stream-guard: ## Every printing script survives a cp1252 console
	@$(PYTHON) scripts/check-stream-guard.py

.PHONY: check-refs
check-refs: ## Every cited path exists, and env.example is the catalogue it claims to be
	@$(PYTHON) scripts/check-doc-paths.py
	@$(PYTHON) scripts/check-env-catalogue.py

.PHONY: check-log
check-log: ## The iteration log stays inside its bound
	@$(PYTHON) scripts/check-log-retention.py

.PHONY: roadmap
roadmap: ## Regenerate docs/roadmap.md from the ledger and the design graph
	@$(PYTHON) scripts/generate-roadmap.py

.PHONY: precommit
precommit: check ## What the hook runs; run it before committing

# --- Working with origin --------------------------------------------------

.PHONY: pull
pull: ## Fast-forward development onto origin, or stop on a fork
	@bash scripts/sync.sh pull

.PHONY: push
push: check ## Gate, then push development to origin
	@bash scripts/sync.sh auto-push

# --- Hooks ----------------------------------------------------------------

.PHONY: install-hooks
install-hooks: ## Point git at .githooks so the pre-push gate is armed
	@git config core.hooksPath .githooks
	@echo "core.hooksPath = .githooks"

.PHONY: uninstall-hooks
uninstall-hooks: ## Stop using the repository's hooks
	@git config --unset core.hooksPath || true
	@echo "core.hooksPath unset"

# --- Local stack ----------------------------------------------------------

.PHONY: infra-up
infra-up: ## Start PostgreSQL on 5434
	@docker compose up -d
	@echo "Postgres on 127.0.0.1:5434 (database valotech)"

.PHONY: infra-down
infra-down: ## Stop the stack, keeping its data
	@docker compose down

.PHONY: infra-reset
infra-reset: ## Stop the stack and delete its data
	@docker compose down -v

# --- Orientation ----------------------------------------------------------

.PHONY: doctor
doctor: ## Say what is present, what is missing, and what is blocked
	@$(PYTHON) scripts/doctor.py
