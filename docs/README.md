# Hotel Offer Orchestrator — Technical Documentation Index

Welcome to the comprehensive technical documentation for the **Hotel Offer Orchestrator**. This documentation suite details the end-to-end architecture, technical design, workflow orchestration, database storage, deployment mechanisms, and testing strategies implemented in this project.

---

## 📚 Documentation Table of Contents

| File | Document | Purpose & Summary |
| :--- | :--- | :--- |
| [01-project-overview.md](file:///Users/saurabh/Documents/hotel%20offer/docs/01-project-overview.md) | **Project Overview** | High-level introduction, business problem, requirements, tech stack justification, and request-response lifecycle. |
| [02-project-structure.md](file:///Users/saurabh/Documents/hotel%20offer/docs/02-project-structure.md) | **Project Structure** | Complete file tree, module responsibilities, import/export analysis, and separation of concerns. |
| [03-system-architecture.md](file:///Users/saurabh/Documents/hotel%20offer/docs/03-system-architecture.md) | **System Architecture** | Component, logical, runtime, and deployment architectures with Mermaid diagrams. |
| [04-complete-workflow.md](file:///Users/saurabh/Documents/hotel%20offer/docs/04-complete-workflow.md) | **Complete Request Workflow** | Step-by-step trace of `GET /api/hotels?city=delhi` across Express, Redis, Temporal, and Suppliers. |
| [05-temporal-deep-dive.md](file:///Users/saurabh/Documents/hotel%20offer/docs/05-temporal-deep-dive.md) | **Temporal.io Deep Dive** | Workflows, activities, workers, task queues, retry policies, determinism, and comparisons with vanilla `Promise.all`. |
| [06-redis-deep-dive.md](file:///Users/saurabh/Documents/hotel%20offer/docs/06-redis-deep-dive.md) | **Redis Deep Dive** | Redis Sorted Sets (ZSET), Hashes, atomic cache invalidation, and `ZRANGEBYSCORE` price filtering. |
| [07-dependencies-and-technology.md](file:///Users/saurabh/Documents/hotel%20offer/docs/07-dependencies-and-technology.md) | **Dependencies & Tech Stack** | Line-by-line justification for installed packages, runtimes, and scripts. |
| [08-api-reference.md](file:///Users/saurabh/Documents/hotel%20offer/docs/08-api-reference.md) | **API Reference** | Detailed specifications, query parameters, curl examples, and JSON payloads for all endpoints. |
| [09-data-model-and-business-logic.md](file:///Users/saurabh/Documents/hotel%20offer/docs/09-data-model-and-business-logic.md) | **Data Models & Business Logic** | TypeScript interfaces, normalization, price comparison algorithms, and tie-breaking rules. |
| [10-docker-and-deployment.md](file:///Users/saurabh/Documents/hotel%20offer/docs/10-docker-and-deployment.md) | **Docker & Deployment** | Multi-stage Dockerfile, Docker Compose topology, service dependencies, and orchestration. |
| [11-testing-and-debugging.md](file:///Users/saurabh/Documents/hotel%20offer/docs/11-testing-and-debugging.md) | **Testing & Debugging** | Test suites, mock strategies, Jest verification of 14 core requirements, and Postman execution. |
| [12-code-walkthrough.md](file:///Users/saurabh/Documents/hotel%20offer/docs/12-code-walkthrough.md) | **Code Walkthrough** | File-by-file, function-by-function breakdown of source code. |
| [13-interview-preparation.md](file:///Users/saurabh/Documents/hotel%20offer/docs/13-interview-preparation.md) | **Interview Preparation Guide** | Senior backend engineer interview questions, architecture defenses, trade-offs, and scalability answers. |
| [FINAL-TECHNICAL-AUDIT.md](file:///Users/saurabh/Documents/hotel%20offer/docs/FINAL-TECHNICAL-AUDIT.md) | **Final Technical Audit Report** | Forensic infrastructure audit report verifying Temporal, Redis, and Docker Compose. |

---

## ✅ Documentation Coverage Checklist

- [x] **01-project-overview.md**: High-level problem, capabilities, tech stack justification.
- [x] **02-project-structure.md**: Full tree, every source file explained with imports and exports.
- [x] **03-system-architecture.md**: Component, logical, runtime, storage, and deployment diagrams.
- [x] **04-complete-workflow.md**: End-to-end 24-step trace from HTTP request to response, failure branches.
- [x] **05-temporal-deep-dive.md**: Temporal fundamentals, workflow determinism, activities, retry policies, comparison with in-process promises.
- [x] **06-redis-deep-dive.md**: Sorted Sets, hashes, atomic pipelines, ZRANGEBYSCORE queries, memory vs DB filtering.
- [x] **07-dependencies-and-technology.md**: Comprehensive analysis of npm packages and engines.
- [x] **08-api-reference.md**: Full documentation for `/api/hotels`, `/supplierA/hotels`, `/supplierB/hotels`, and `/health`.
- [x] **09-data-model-and-business-logic.md**: Deduplication algorithm, name normalization, tie-breaker, complexity analysis.
- [x] **10-docker-and-deployment.md**: Multi-stage Dockerfile, 5 docker compose services, health checks, networking.
- [x] **11-testing-and-debugging.md**: 46 automated tests covering 14 core requirements.
- [x] **12-code-walkthrough.md**: Deep code walkthrough of every major file in `src/`.
- [x] **13-interview-preparation.md**: 20+ senior engineering interview questions with project-specific answers.
