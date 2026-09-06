# VALO Tech — the commands this repository actually has.
#
# A target exists here when something in the tree needs it. The siblings carry
# a hundred and forty targets because they carry a hundred and forty things to
# check; a target that checks nothing has only ever passed.

.DEFAULT_GOAL := help
SHELL := /bin/sh

PYTHON ?= python
NODE   ?= node
PORT   ?= 8123

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
check: check-copy check-decisions check-designs check-review ## Run every gate this repository has

.PHONY: check-copy
check-copy: ## The served English copy still matches the dictionary
	@$(NODE) scripts/sync-static-copy.mjs --check

.PHONY: check-decisions
check-decisions: ## The decision register holds its contract
	@$(PYTHON) scripts/validate-decisions.py

.PHONY: check-designs
check-designs: ## Design frontmatter is coherent and its codes resolve
	@$(PYTHON) scripts/validate-designs.py --strict

.PHONY: check-review
check-review: ## Every REVIEW row and the task it names point at each other
	@$(PYTHON) scripts/check-review-refer-to.py

.PHONY: precommit
precommit: check ## What the hook runs; run it before committing

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
