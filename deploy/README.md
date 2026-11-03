# Deploy — LearnSphere microservices on Kubernetes

## Local first: Jenkins → Docker Hub → minikube · then AWS: EKS + ECR (§9)

> **Status: proposed, under review (3 Nov 2026). Nothing in this document is built yet.**
>
> - The commands in §5 arrive with phases D1 and D2 (§8). Until then this file is the plan.
> - The files already in `deploy/` (`Dockerfile`, `Jenkinsfile`, `lms-deployment.yaml`) predate
>   it. They do not describe the system (`ARCHITECTURE.md` §8).

LearnSphere is deployed as **five independent microservices**:

- frontend
- backend
- video-transcoder
- order-service
- notification-service

Each one is built, tested, versioned, deployed and rolled back **on its own**, by its own Jenkins
pipeline. Here is what happens on a push to `master`:

1. Only the services you changed are rebuilt.
2. Their images are pushed to **Docker Hub**.
3. They roll out to **minikube** with zero downtime.

Secrets live in **Jenkins credentials** and **Kubernetes Secrets**, never in git.

**Scope:** two stages.

1. **Local** (§1–§8, phases D0–D3): everything on one laptop.
2. **AWS** (§9, phases A0–A4): EKS, ECR, real S3, managed datastores, Secrets Manager and TLS.

AWS reuses the local work as-is: the Dockerfiles, image tags, Kustomize `base/` layers,
HTTPRoutes and Secret names. Each service gets an `eks/` layer beside its `minikube/` one.

---

## 1. The picture

```text
 git push master ──▶ GitHub (public repo)
                          │  each job polls every 2 min, only for its own folder
                          ▼
 ┌─ deploy/docker-compose.yml  (compose project "learnsphere-ci") ─────────┐
 │  jenkins 127.0.0.1:8090 ── jobs: platform · frontend · backend ·          │
 │          │                  video-transcoder · order-service ·            │
 │          │                  notification-service                          │
 │          └──TLS──▶ dind (docker:dind)   tests + image builds run here     │
 └───────┬────────────────────────────────────────────┬────────────────────┘
         │ docker push <user>/learnsphere-<service>:<tag>
         ▼                                             │ kubectl as ServiceAccount
     Docker Hub ◀──── pull (read-only token) ─────┐   │ jenkins-deployer, over the
                                                  │   ▼ "minikube" docker network
 ┌─ minikube ─ namespace learnsphere ─────────────────────────────────────┐
 │  Gateway (Envoy) ─ http://learnsphere.localhost ─ each service attaches │
 │                                                    its own HTTPRoute    │
 │   frontend :3000   backend :5000   video-transcoder :7000               │
 │   order-service :8086              notification-service :8085           │
 │  storage.learnsphere.localhost → localstack :4566 (presigned uploads)   │
 │  platform: postgres · redis · kafka · mongodb · localstack (own data)   │
 └──────────────────────────────────────────────────────────────────────────┘
          ▲ minikube tunnel → 127.0.0.1:80
       Browser
```

### One service deploy, end to end

1. **Trigger.** You push a change under `backend/`. Within about 2 minutes the `backend` job
   notices it. The other four jobs see nothing in their folders and don't run.
2. **Plan.** The image tag is the git tree hash of `backend/`. If that tag is already on Docker
   Hub, the build is skipped.
3. **Test, then build.**
   1. The Dockerfile's `test` stage runs the backend's Jest suite.
   2. The `runtime` stage builds the image, which is pushed to Docker Hub.
4. **Migrate.** The Prisma migration Job runs before the new code.
5. **Deploy.** Kubernetes starts a new backend pod and waits until it is ready, then stops the old
   one.
6. **Smoke.** A test pod calls the backend's routes through the gateway.
7. **On failure.** Any red step stops *this* job only. A failed rollout is undone, back to the
   previous backend. The other services are untouched throughout.

---

## 2. Recommendation: how to deploy these microservices

### 2.1 Each service is its own release unit

| Service | Image | Jenkins job | Manifests | Depends on at runtime |
| --- | --- | --- | --- | --- |
| frontend | `<user>/learnsphere-frontend` | `frontend` | `k8s/services/frontend/` | backend (server-side ui-config) |
| backend | `<user>/learnsphere-backend` | `backend` | `k8s/services/backend/` (+ migrate Job) | postgres `public`, redis, kafka, localstack |
| video-transcoder | `<user>/learnsphere-video-transcoder` | `video-transcoder` | `k8s/services/video-transcoder/` | kafka, localstack, backend `/processed` callback |
| order-service | `<user>/learnsphere-order-service` | `order-service` | `k8s/services/order-service/` | postgres `orders`, redis, kafka, backend catalogue |
| notification-service | `<user>/learnsphere-notification-service` | `notification-service` | `k8s/services/notification-service/` | mongo, redis, kafka, SMTP / FCM / Twilio |
| *shared platform* | — | `platform` | `k8s/platform/` | Gateway and the datastores |

Each service also owns its own pieces:

- **Its own HTTPRoute.** It declares its URL paths itself and attaches to the shared Gateway.
  This is how Gateway API is meant to be used.
- **Its own Secret, ConfigMap and resource limits.**
- **Its own release history.** "backend #42" is a backend release, nothing else.

### 2.2 What makes independent deploys safe

Five services shipping on their own schedules only works if no deploy assumes another one
happened at the same time. These are the contract:

- **HTTP APIs change additively.** Add fields and endpoints; never remove or rename in one step.
  At any moment the frontend may be older or newer than the backend.
- **Kafka events change additively.** New fields are optional and consumers ignore unknown ones.
  Topic names and keys never change in place: `video.uploaded`, `order.paid`, `order.refunded`,
  `notifications`.
- **Database migrations go expand → migrate → contract**, each step its own deploy.
  - A rollback reverts code, never the schema.
  - One schema per service, one writer per table, as today (`DATABASE_DESIGN.md` §1).
- **No deploy ordering.**
  - A service must start and stay ready while a peer is old, restarting or briefly down. That
    means retries and backoff on calls.
  - Readiness checks only a service's *own* datastores, never another service.
- **Shared keys are the one deliberate coupling.**
  - `ACCESS_TOKEN_SECRET`: the backend signs; order-service and notification-service verify.
  - `INTERNAL_API_KEY` and `TRANCODER_API_KEY` are shared the same way.
  - Changing one restarts every service that uses it. `make k8s-secrets` does that.

### 2.3 Is Jenkins on the laptop the most feasible option?

It works, but it is the heaviest part of the plan. Docker Desktop's VM has **7.7 GiB** today, and
CI builds alone peak at about 3 GiB. Here are the two realistic options:

| Aspect | **A. Jenkins on this Mac** (as asked) | **B. GitHub Actions + Argo CD** |
| --- | --- | --- |
| Where builds and tests run | Docker-in-Docker on your Mac | GitHub's runners, free for public repos (arm64 included) |
| Laptop memory at peak | ~11 GiB → Docker Desktop must go to 12 GiB | ~7 GiB → fits today's 7.7 GiB, tightly |
| How it deploys | Jenkins pushes with `kubectl` | Argo CD inside the cluster pulls from git |
| Where credentials live | Docker Hub + cluster token in Jenkins | Docker Hub token in GitHub secrets; cluster credentials never leave the cluster |
| Record of what is deployed | Jenkins build history | git history: what runs is what's in git |
| Extra moving parts | Jenkins, a privileged dind container, plugins | Argo CD (~0.5 GiB), one tag-bump commit per deploy |
| Roadmap | matches `ARCHITECTURE.md` §5.2 ("Kubernetes + Jenkins") | changes it |

**My recommendation is A, with per-service pipelines.**

- It's what you asked for and it's on the roadmap.
- It is the better place to learn how Jenkins and Kubernetes fit together.
- Every decision below assumes it.

**Switch to B if raising Docker Desktop to 12 GiB makes the Mac sluggish.** B is the only option
that fits today's memory. Everything in §3.1 (images) and §3.2 (Kubernetes) carries over
unchanged; only the pipeline layer swaps.

On AWS, deploys become pull-based either way: Jenkins pushes to ECR and Argo CD inside EKS
deploys (§9.2). A laptop should not hold credentials for a cloud cluster.

---

## 3. Decisions

### 3.1 Docker — images and registry

**One multi-stage Dockerfile per service, next to its code.**

- The stages run `deps → test → build → runtime`.
- Tests run in the `test` stage. A red test means no image and no push.
- Nothing has to be installed on Jenkins.

**Base images, pinned in `deploy/versions.env`.**

- Node services use `node:24-slim`, matching your local Node 24.
- Spring services use `eclipse-temurin:21-jdk` to build and `21-jre` to run, matching
  `<java.version>21`.
- Debian slim rather than Alpine: Prisma and the bundled ffmpeg want glibc.

**Images run as non-root.**

- Every `.dockerignore` excludes `.env*`, `node_modules`, `target` and `.next`.
- Jenkins builds from a clean git checkout, so your dev `.env` files never exist there anyway.

**Tag = git tree hash of the service's folder** (`git rev-parse HEAD:backend`).

- An unchanged service keeps its tag, so it is neither rebuilt nor restarted.
- Tags are never overwritten. A forced rebuild gets a `-f<build>` suffix.
- The frontend's tag also carries a hash of its build args.
- `:latest` is never used.

**Docker Hub: five public repos, `<user>/learnsphere-<service>`.**

- The GitHub repo is already public, and images carry no secrets by construction.
- Jenkins pushes with a **read/write** token. The cluster pulls with a separate **read-only**
  token, which also avoids anonymous rate limits.

**arm64 only.** This Mac and minikube are arm64, and so is EKS on Graviton (§9.2). The same images
run in both places without multi-arch builds.

**BuildKit cache mounts for npm and Maven**, so rebuilds don't re-download dependencies.

### 3.2 Kubernetes — minikube

**Cluster:** minikube, docker driver, `--cpus=6 --memory=7g --disk-size=40g`, pinned Kubernetes
version.
It is one namespace, `learnsphere`.

**Manifests: Kustomize, built into `kubectl`, not Helm.** Every service and the platform have a
`base/` layer (portable) and a `minikube/` layer (local values). A production layer such as
`eks/` can be added next to `minikube/` later.

**The platform: Gateway + datastores**, as StatefulSets with persistent volumes. Versions match
the dev compose:

| Datastore | Image |
| --- | --- |
| Postgres | 15 |
| Redis | 7 |
| Kafka | `cp-kafka` 7.8.3, KRaft |
| Mongo | 7 |
| LocalStack | 4.14, the last community release (later tags need an auth token) |

The datastores exist only in the `minikube` layer, since production uses managed services. CI
never migrates or consumes from your dev database or Kafka.

**Edge: Gateway API + Envoy Gateway, one origin `http://learnsphere.localhost`.**

- One origin keeps the auth cookie and CORS trivial.
- `*.localhost` keeps cluster cookies apart from your dev `localhost` session.
- Routes are an allow-list (§6.3).

**Rollouts.**

- `RollingUpdate` with `maxUnavailable: 0` and `maxSurge: 1`.
- Readiness, liveness and startup probes.
- A `preStop` sleep so in-flight requests finish.
- One replica per service locally.

**Migrations.**

- Prisma runs as Job `backend-migrate-<tag>`, inside the backend's pipeline, before the backend
  rolls.
- Flyway runs on order-service start, as it does today.

**Config.**

- Non-secret values are checked in as `services/<service>/minikube/config.env` and become a
  ConfigMap. A change gets a new hash suffix, so that service rolls.
- Secrets come from `make k8s-secrets` (§3.4).

### 3.3 Jenkins — CI/CD

**Runs from `deploy/docker-compose.yml`** as two containers:

- `jenkins`: a custom image, Jenkins LTS (jdk21) plus the docker CLI/buildx and `kubectl`.
- `dind`: privileged, talking TLS to Jenkins.

UI at `http://localhost:8090` (8080 is Kafka UI), bound to `127.0.0.1` only. It is a separate
compose project, so `make stop` never touches it.

**Six jobs, one Jenkinsfile.**

- Job DSL creates `platform` plus one job per service. All of them run `deploy/Jenkinsfile`, each
  with its own `SERVICE`.
- Each job polls `master` and triggers only when files under its own folders change:
  `<service>/` and `deploy/k8s/services/<service>/`.
- A failure stops only that service.

**At most two builds at once** (two executors). Builds queue instead of exhausting memory when
one push touches several services.

**Configured as code** (Configuration-as-Code plus Job DSL).

- The admin user, the credentials and all six jobs are defined in `jenkins/casc.yaml`.
- There is no setup wizard and nothing to click.
- History survives restarts in the `jenkins_home` volume.

**Reaches minikube by joining the `minikube` Docker network.**

- It uses a kubeconfig for ServiceAccount `jenkins-deployer`.
- That account can only manage workloads in `learnsphere`. It cannot read Secrets, other
  namespaces or cluster objects.

**Source:** GitHub `master`. The repo is public, so no credential is needed. Jenkins polls because
GitHub cannot reach a laptop; webhooks would need a tunnel.

**The Jenkinsfile stays thin; `deploy/scripts/*.sh` do the work.**
`make k8s-deploy SERVICE=backend` runs the identical path from your laptop when Jenkins is down.

### 3.4 Secrets: two homes, neither of them git

Both are seeded from `.local/`, which is already excluded from git on this clone.

- D0 also adds `.local/` to the tracked `.gitignore`, so every clone is protected.
- Scripts never print values.
- Application secrets never pass through Jenkins.

**Jenkins credentials** are only what the pipelines use. They are created from files in
`.local/ci/`.

| ID | Type | Used for |
| --- | --- | --- |
| `dockerhub` | username + **read/write** token | pushing images |
| `minikube-kubeconfig` | secret file | ServiceAccount token + cluster CA + `https://<minikube ip>:8443` |
| `frontend-build-env` | secret file | `NEXT_PUBLIC_FIREBASE_*` for the frontend build, copied from `frontend/.env.local` |
| admin login | file | generated password in `.local/ci/jenkins_admin_password` |

**Kubernetes Secrets** are what the services use. They are created by `make k8s-secrets` from
`.local/k8s/secrets.env`.

- One Secret per service, holding only what that service needs.
- Internal values are **generated** on first run and reused after that:
  - DB, Redis and Mongo passwords.
  - The JWT secrets.
  - `INTERNAL_API_KEY` and `TRANCODER_API_KEY`.
  - The mock webhook secret.
- External ones (SMTP, Twilio, Razorpay, Stripe) are **imported** from the services' dev `.env`
  files when present.

| Secret | Keys (summary) | Used by |
| --- | --- | --- |
| `backend-secrets` | `DATABASE_URL`, `REDIS_URI`, JWT/access/refresh secrets, `BCRYPT_PEPPER`, `INTERNAL_API_KEY`, `TRANCODER_API_KEY`, AWS creds | backend + migrate Job |
| `transcoder-secrets` | `TRANCODER_API_KEY`, AWS creds | video-transcoder |
| `order-secrets` | datasource user/password, `REDIS_PASSWORD`, `ACCESS_TOKEN_SECRET`, `INTERNAL_API_KEY`, mock/Razorpay/Stripe keys | order-service |
| `notification-secrets` | `MONGODB_URI`, `REDIS_PASSWORD`, `ACCESS_TOKEN_SECRET`, `INTERNAL_API_KEY`, SMTP, Twilio | notification-service |
| `notification-firebase` | `creds.json` (from `.local/firebase-creds.json`, mounted as a file) | notification-service |
| `postgres-` / `redis-` / `mongo-credentials` | root credentials | platform datastores |
| `dockerhub-pull` | `dockerconfigjson`, **read-only** token | every pod (default ServiceAccount) |

> minikube stores Secrets base64-encoded, not encrypted at rest. That is fine for local use.
> Production moves to KMS envelope encryption plus AWS Secrets Manager (`ARCHITECTURE.md` §8).

### 3.5 Rejected

| Option | Why not |
| --- | --- |
| One pipeline deploying all five services | A red test in one service would block fixes in the other four |
| Host `docker.sock` mounted in Jenkins | A pipeline could touch your dev containers, including LocalStack and its in-memory S3. This Mac also has no `/var/run/docker.sock` |
| minikube's `ingress` addon | It installs `ingress-nginx` v1.15.1, retired upstream in March 2026 |
| A NodePort per service | Several origins break the one-cookie auth model |
| `minikube image load` / `docker-env` | Skips Docker Hub |
| Datastores on the host via `host.minikube.internal` | Shares the dev DB and Kafka consumer groups with the cluster. CI migrations would hit dev data |
| App secrets stored in Jenkins | Jenkins would hold every key. It only needs push and deploy credentials |
| Helm / Bitnami charts | Not needed for five services; Bitnami's free catalogue was cut back in 2025 |
| A namespace per service | Adds RBAC and DNS overhead with no benefit on one laptop. NetworkPolicies per service come in D3 |

---

## 4. App changes this needs (phase D0)

None of these change the dev workflow.

1. **backend.**
   - Add a real `build` script (`tsc` — it type-checks clean today — plus copying
     `config/ui/*.json` into `dist/`) and a `start` script.
   - Move `prisma` to `dependencies` so the migrate Job can run.
2. **backend.** Add an optional `S3_PUBLIC_ENDPOINT`, used only for presigning.
   - Today upload and thumbnail URLs are signed with the backend's own S3 endpoint. In-cluster
     that is `http://localstack:4566`, which the browser cannot resolve.
   - When unset, dev and AWS behave exactly as now.
3. **frontend.** Use `output: 'standalone'` only when `NEXT_OUTPUT=standalone`.
4. **frontend.** Add a server-only `API_INTERNAL_URL` for the server-side ui-config fetch.
   - In-cluster it is set to `http://backend:5000`.
   - Without it, the pod would fetch the public origin, fail, and silently render the bundled
     default config.

order-service, notification-service and the transcoder need env changes only.

---

## 5. Instructions

> These commands land with D1 (cluster) and D2 (Jenkins). They are written now so the plan can
> be reviewed as the thing you will actually type.

### 5.1 Prerequisites (once)

1. **Docker Desktop memory.** Settings → Resources:
   - Memory **12 GiB**. It is 7.7 GiB today (§2.3, §6.4).
   - CPUs 8 or more.
   - Disk 60 GB or more.
2. **Tools.** You already have minikube v1.39 and kubectl v1.37. Helm is not needed.
3. **Docker Hub access tokens.** Docker Hub → Account settings → Personal access tokens. Create
   two:
   - `learnsphere-ci-push`, with **Read & Write**, for Jenkins.
   - `learnsphere-cluster-pull`, with **Read-only**, for minikube.

   You type them once into `make ci-secrets`. Never put them in a file in git or in chat.
4. **Push notifications (optional).** Google Cloud console → APIs & Services → Credentials → the
   browser API key → Website restrictions. Add `http://learnsphere.localhost/*`.
5. **Browsers other than Chrome (optional).** Chrome resolves `*.localhost` by itself. For Safari,
   curl and other tools, add this line to `/etc/hosts`:
   `127.0.0.1 learnsphere.localhost storage.learnsphere.localhost`

### 5.2 First-time setup

```bash
make stop-except-localstack   # free memory; your dev S3 data survives
make k8s-up                   # minikube + Envoy Gateway + namespace, Jenkins RBAC + kubeconfig
make ci-secrets               # prompts: Docker Hub username, push token, pull token
make k8s-secrets              # generates internal secrets, imports SMTP etc. from dev .env files
make ci-up                    # Jenkins on localhost:8090 (user admin, password in .local/ci/jenkins_admin_password)
make k8s-tunnel               # in a second terminal; keep it open (asks for sudo once)
```

Then open Jenkins and click **Build Now** on `platform`.

- It brings up the Gateway and datastores, then starts the five service jobs.
- The first run is slow because it downloads base images and dependencies.

Finally, open `http://learnsphere.localhost`.

### 5.3 Everyday

| You want to | Do |
| --- | --- |
| Deploy your latest work | `git push origin master`. The jobs of the services you touched run within ~2 min; the rest stay idle |
| Deploy one service now | Jenkins → that service's job → **Build Now** |
| Rebuild a service from scratch (e.g. base-image updates) | that job → **Build with Parameters** → `FORCE_REBUILD` |
| Redeploy everything | `platform` → **Build with Parameters** → `DEPLOY_ALL_SERVICES` |
| Deploy without Jenkins | `make k8s-deploy SERVICE=backend`. Same scripts, using your own `docker login` and kubeconfig |
| Change a secret | Edit `.local/k8s/secrets.env` → `make k8s-secrets`. It restarts only the services that use it |
| Change non-secret config | Edit `deploy/k8s/services/<service>/minikube/config.env`, commit, push. That service rolls |
| Roll back a service by hand | `kubectl -n learnsphere rollout undo deploy/<service>` |

### 5.4 Looking inside

```bash
make k8s-status                                         # pods, services, routes
kubectl -n learnsphere logs deploy/backend -f           # any service by name
kubectl -n learnsphere rollout history deploy/backend   # that service's releases
kubectl -n learnsphere exec -it statefulset/postgres -- psql -U learnsphere -d learnsphere
kubectl -n learnsphere port-forward svc/notification-service 8085   # an unrouted API, e.g. DLQ replay
```

### 5.5 Stopping and cleaning up

| Command | Effect |
| --- | --- |
| `make ci-down` | Jenkins off. Config, history and build cache are kept |
| `make k8s-stop` | minikube off. Database data is kept. The cluster's LocalStack S3 is lost, because it is in memory, as in dev |
| `make k8s-delete` | Wipes the cluster. Afterwards run `make k8s-up`, `make k8s-secrets`, then `make ci-up` so Jenkins rejoins the recreated network. Secret values are reused from `.local/k8s/` |
| `make ci-prune` | Frees Docker-in-Docker build cache |
| Back to dev | `make k8s-stop && make infra && make start` |

### 5.6 Troubleshooting

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| Pod shows `CreateContainerConfigError` | a Secret or key is missing | `make k8s-secrets` |
| `ErrImagePull` / `toomanyrequests` | pull secret missing, or a Docker Hub rate limit | `make k8s-secrets`, then check the read-only token |
| `OOMKilled` | memory limit too low (often the transcoder on a 2160p source) | raise it in that service's `minikube/` layer, check Docker Desktop memory |
| Deploy stage: `Unauthorized` / `x509` / timeout | minikube was recreated, so it has a new CA, IP and network | `make k8s-up`, then `make ci-up` |
| `no space left on device` during a build | build cache full | `make ci-prune` |
| `learnsphere.localhost` doesn't load | the tunnel isn't running | `make k8s-tunnel` |
| Upload fails with a CORS error | the origin is missing from S3 CORS | `S3_CORS_ALLOWED_ORIGINS` in the backend's `config.env` |
| Login works in Chrome but not Safari/Firefox | `Secure` cookies over plain HTTP | use Chrome until TLS (D3) |
| Videos are gone after a restart | the cluster's LocalStack is in memory | re-upload |

---

## 6. Reference

### 6.1 Folder layout (target)

```text
deploy/
├── README.md                  this file
├── docker-compose.yml         Jenkins + dind
├── versions.env               every pinned version: Jenkins LTS, kubectl, Envoy Gateway, k8s, base images
├── Jenkinsfile                one file; every job runs it with its own SERVICE
├── jenkins/
│   ├── Dockerfile             Jenkins LTS jdk21 + docker CLI/buildx + kubectl
│   ├── plugins.txt            configuration-as-code, job-dsl, workflow-aggregator, git,
│   │                          credentials-binding, timestamper, ws-cleanup, pipeline-graph-view
│   └── casc.yaml              admin user, credentials, the six jobs
├── k8s/
│   ├── cluster/               one-time, admin-applied: Namespace, GatewayClass, Jenkins RBAC
│   ├── platform/
│   │   ├── base/              Gateway
│   │   └── minikube/          + postgres, redis, kafka, mongodb, localstack, storage route
│   └── services/<service>/
│       ├── base/              Deployment, Service, HTTPRoute (its own paths)
│       └── minikube/          config.env, resources, replicas, smoke.txt (backend: + migrate Job)
└── scripts/
    ├── cluster-up.sh          minikube → Envoy Gateway → cluster/ → Jenkins kubeconfig
    ├── seed-secrets.sh        .local/k8s → Kubernetes Secrets
    ├── ci-secrets.sh          Docker Hub creds (prompted), admin password, Firebase public config → .local/ci
    ├── platform.sh            apply platform/, wait for datastores
    ├── build.sh <service>     tag → skip if on Docker Hub → test stage → runtime stage → push
    └── deploy.sh <service>    migrate (backend) → apply → rollout status → undo on failure → smoke
<service>/Dockerfile and <service>/.dockerignore live next to each service
```

### 6.2 Images

| Service | Runtime | `test` stage runs | Port | Notes |
| --- | --- | --- | --- | --- |
| frontend | Next standalone on `node:24-slim` | lint, check-styles, vitest | 3000 | `NEXT_PUBLIC_*` baked at build; all four API bases = `http://learnsphere.localhost` |
| backend | `node dist/index.js` | `prisma generate` + jest | 5000 | `openssl` for Prisma; image also runs the migrate Job |
| video-transcoder | `node dist/index.js` | `node:test` (incl. real ffprobe) | 7000 | bundled ffmpeg (parity with dev); 10 GiB scratch at `/tmp/video-transcode` |
| order-service | layered jar on `temurin:21-jre` | `./mvnw test` (Testcontainers test skips, as today) | 8086 | `-XX:MaxRAMPercentage=75` |
| notification-service | layered jar on `temurin:21-jre` | `./mvnw test` | 8085 | Firebase key mounted as a file |

### 6.3 Routes: an allow-list, each owned by its service

Everything on host `learnsphere.localhost` except the last row:

| Path prefix | Service |
| --- | --- |
| `/` | frontend :3000 |
| `/api/v1/users`, `/video-upload`, `/courses`, `/instructor-requests`, `/admin`, `/ui-config`, `/health` | backend :5000 |
| `/api/v1/orders`, `/api/v1/admin/orders`, `/api/v1/mock-gateway`, `/api/v1/webhooks` | order-service :8086 |
| `/api/v1/notifications/inbox`, `/api/v1/devices` | notification-service :8085 |
| `/api/video-transcoder` | video-transcoder :7000 |
| host `storage.learnsphere.localhost`, `/` | localstack :4566 (presigned uploads and thumbnails) |

The longest prefix wins, so `/api/v1/admin/orders` reaches order-service and the rest of
`/api/v1/admin` reaches the backend.

Some paths are **deliberately not routed**. They fall through to the frontend's 404 and stay
reachable inside the cluster or via `port-forward`:

- `/api/v1/internal/*`
- notification-service's send API, `/templates` and `/admin/dead-letters`
- `/actuator/*`
- the transcoder's `/health`

The transcoder's `/processed` callback sits under a routed prefix and is protected by its API
key. Blocking it at the edge is a D3 item.

### 6.4 Resource budget (estimates; D1 measures them)

Everything runs inside Docker Desktop's VM.

| Block | Steady | Peak |
| --- | --- | --- |
| minikube system + Envoy Gateway | ~1.3 GiB | same |
| platform: postgres 256 Mi, redis 32 Mi, kafka 768 Mi (heap 512 m), mongo 256 Mi, localstack 384 Mi | ~1.7 GiB | same |
| services: frontend/backend ~192 Mi each, order/notification ~384 Mi each, transcoder 512 Mi | ~1.7 GiB | transcoder up to 2 GiB on 2160p |
| Jenkins (`-Xmx768m`) + dind | ~1.2 GiB | ~3 GiB with two builds running |
| dev LocalStack (kept running) | ~0.5 GiB | same |

That comes to about 6.4 GiB steady and about 11 GiB at peak, hence the 12 GiB prerequisite.

- Don't run the dev compose datastores at the same time.
- `make ci-down` after deploying brings the cluster's steady state back to about 5 GiB.
- Kafka UI, mongo-express and RedisInsight are not deployed. Use `port-forward` or `exec`.

### 6.5 Pipeline stages

The **service job** runs with:

- `disableConcurrentBuilds`.
- Timestamps.
- A 30-minute timeout.
- Keep the last 20 builds.
- Parameter `FORCE_REBUILD`.

Its stages:

1. **Plan.** Compute the tag; skip the build if it is already on Docker Hub. The deploy still
   runs, since a config change needs no new image.
2. **Test.** Build the Dockerfile's `test` target.
3. **Build & push.** Build the `runtime` target and push it. Docker Hub login lives in a
   per-build `DOCKER_CONFIG` that is deleted afterwards.
4. **Migrate** (backend only). Run Job `backend-migrate-<tag>`. If it fails, stop with nothing
   rolled.
5. **Deploy.**
   1. Check `kubectl auth can-i`.
   2. Run `kubectl apply -k services/<service>/minikube` with the tag.
   3. Wait on `rollout status`.
   4. On failure, run `rollout undo` and print `describe` and logs.
6. **Smoke.** A one-shot pod checks the service's own `smoke.txt` through the gateway:
   - backend: `/api/v1/health` returns 200.
   - order-service: `/api/v1/orders` returns 401.
   - frontend: `/` returns 200.

The **platform job**:

1. Apply `platform/minikube`.
2. Wait until every datastore is ready.
3. With `DEPLOY_ALL_SERVICES`, start the five service jobs.

**Probes:**

- backend: `/api/v1/health`.
- transcoder: `/health`.
- Spring services: Actuator liveness/readiness, plus a startup probe for JVM boot.
- frontend: TCP 3000.

---

## 7. Command summary (to be added to the root Makefile)

`k8s-up` · `k8s-secrets` · `k8s-tunnel` · `k8s-deploy SERVICE=<service>` · `k8s-status` ·
`k8s-stop` · `k8s-delete` · `ci-secrets` · `ci-up` · `ci-down` · `ci-logs` · `ci-prune`. Each is
described in §5.

---

## 8. Phases

Each phase leaves everything working and is verified before the next one starts.

**D0 — Images.**

- Build: the five Dockerfiles and `.dockerignore` files, the app changes in §4, and `.local/`
  added to `.gitignore`.
- *Verify:*
  - Every image builds on arm64 with its tests green.
  - Each container starts against the dev datastores and answers its health check.
  - `make start` behaves exactly as before.

**D1 — The cluster, deployed by hand.**

- Build:
  - `cluster-up.sh`, the Envoy Gateway setup and `seed-secrets.sh`.
  - The platform and per-service Kustomize folders.
  - `platform.sh`, `build.sh`, `deploy.sh` and the `make k8s-*` targets.
- *Verify on `http://learnsphere.localhost`:*
  - The full flow: signup → OTP → login → create course → upload → transcode → play →
    mock purchase → enrolment → inbox.
  - Redeploying one service under a curl loop drops no requests.
  - A broken image is rolled back without touching the other services.

**D2 — Jenkins.**

- Build:
  - `docker-compose.yml`, the Jenkins image, plugins and Configuration-as-Code with all six jobs.
  - `ci-secrets.sh`, the Jenkinsfile and the smoke stage.
- *Verify:*
  - `make ci-up` gives a configured Jenkins with no clicks.
  - A one-line change in `backend/` runs only the `backend` job, end to end.
  - A red test in one service doesn't stop the others.
  - Credentials are masked in the logs.
  - A failed rollout is undone.

**D3 — Hardening.** Later, and each item is independent.

- JUnit reports.
- A Trivy image scan.
- Readiness gated on each service's own datastores.
- TLS with mkcert.
- Runtime frontend config, so one image can be promoted across environments. AWS needs this
  first (A0).
- Per-service database roles.
- NetworkPolicies per service.
- Blocking `/processed` at the edge.
- KEDA scaling of the transcoder and notification-service on Kafka lag.
- Testcontainers tests in CI.
- Metrics (order-service §12.6.1).

**Deferred:**

- Argo CD and External Secrets on the *local* cluster. Both arrive on AWS in A2.
- GitHub webhooks into Jenkins.

Once this plan is agreed, several other documents get updated to match:

- `ARCHITECTURE.md` §5.2, §8 and §9.
- `todo.md` P5.
- The root `CLAUDE.md` and `README.md`.
- A new `docs/diagrams/09-local-cicd.eraser`.

---

## 9. AWS — EKS, ECR and the rest (after local)

> **Direction, not yet a design.** Before A0 starts, this section gets its own HLD → LLD round,
> like every substantial change in this repo.

Local proves the services, images, manifests and pipeline, and AWS reuses all of it. Four things
change:

- the `eks/` layer next to each `minikube/` layer;
- the registry;
- where the datastores live;
- how a deploy reaches the cluster.

### 9.1 Local → AWS

| Concern | Local (minikube) | AWS stage 1 | AWS stage 2 |
| --- | --- | --- | --- |
| Registry | Docker Hub | **ECR** | ECR |
| Cluster | minikube, arm64 | **EKS**, managed node group on Graviton (arm64) | same |
| Edge | Envoy Gateway + `minikube tunnel` | same Envoy Gateway + HTTPRoutes behind an **NLB**, **ACM** TLS, **Route 53** | same |
| Postgres | StatefulSet | StatefulSet on EBS | **RDS for PostgreSQL** |
| Redis | StatefulSet | StatefulSet on EBS | **ElastiCache** |
| Kafka | StatefulSet | StatefulSet on EBS | **MSK** |
| Mongo | StatefulSet | StatefulSet on EBS | **MongoDB Atlas on AWS** or **DocumentDB** |
| Object storage | LocalStack | **S3** (`LOCAL_STACK_DATA_SOURCE=false`) | S3 + **CloudFront** for HLS |
| Secrets | `make k8s-secrets` | **Secrets Manager** → External Secrets Operator, same Secret names | same |
| AWS credentials | `test`/`test` for LocalStack | **EKS Pod Identity** roles, no keys | same |
| Deploy | Jenkins → `kubectl` | Jenkins → ECR, **Argo CD** syncs | same |
| Infrastructure | `make k8s-up` | **Terraform** | Terraform |

### 9.2 Proposed decisions

**Terraform for all AWS infrastructure**, in `deploy/terraform/`.

- It uses the community `terraform-aws-modules` for the VPC and EKS.
- State lives in S3 with native locking.
- Nothing is clicked in the console beyond account setup.
- `terraform destroy` removes everything.

**EKS with a managed node group of Graviton instances across 2 AZs.**

- The images are already arm64, so they run unchanged.
- Start with 2 × `t4g.large`; use `m7g.large` if transcoding exhausts the burst credits.
- Stay on a Kubernetes version in standard support. Extended support raises the control plane
  from $0.10 to $0.60 an hour.

**ECR: one repository per service** (`learnsphere/<service>`).

- Tags are immutable, which matches how we tag anyway.
- Images are scanned on push, and a lifecycle rule keeps the last 30.
- Jenkins builds once and pushes the same image to Docker Hub (local) and ECR (AWS).

**Edge: the same Envoy Gateway and HTTPRoutes as local**, exposed through an NLB created by the
AWS Load Balancer Controller.

- TLS uses an ACM certificate; the origin is `https://learnsphere.<domain>`.
- The routes don't change. Only the Gateway's listener and Service annotations do.
- This also removes local's Chrome-only `Secure`-cookie caveat.

**EKS Pod Identity for AWS access.**

- The backend and transcoder each get an IAM role limited to their buckets, using the
  permissions in `ARCHITECTURE.md` §8.1.
- No Secret contains AWS keys. The code already falls back to the SDK default chain when
  `AWS_ACCESS_KEY_ID` is unset.

**Secrets Manager + External Secrets Operator.**
ESO writes the same Secret names (`backend-secrets` …) the Deployments already read, so no
manifest changes. EKS also envelope-encrypts Secrets at rest.

**Real S3 buckets**: `learnsphere-<env>-raw-video`, `-processed-video` and `-course-assets`.

- Public access is blocked, and the raw bucket has CORS (`ARCHITECTURE.md` §8.1).
- `S3_PUBLIC_ENDPOINT` is left unset; it exists only for LocalStack.

**Datastores move to managed services in two steps.**

- **Stage 1** runs the same StatefulSets on EBS, so the first AWS deploy changes as little as
  possible.
- **Stage 2** moves them one at a time. Each move is a config and Secret change, because services
  only know URLs.

**Delivery: Jenkins pushes to ECR, and Argo CD inside EKS deploys.**

1. Jenkins's only AWS permission is pushing to `learnsphere/*` in ECR.
2. After the push it commits the new tag to that service's `eks/` layer.
3. Argo CD syncs the change.

Cluster credentials never leave AWS, and git records what is running. Jenkins holds two new
credentials:

- an ECR-push-only access key;
- a GitHub fine-grained token with *contents: write* on this repo only.

If Jenkins later moves onto AWS, the access key becomes an instance role.

**The frontend's config moves to runtime (prerequisite).**
Today the public origin is baked in at build time, so one image cannot serve both
`learnsphere.localhost` and the AWS domain. A0 serves those values from the root layout at
request time, the same way the UI config already is. Then one image is promoted from local to
AWS.

### 9.3 Cost

These are rough on-demand prices. Check the AWS Pricing Calculator for your region.

| Item | ~Per month if always on |
| --- | --- |
| EKS control plane | $73 ($0.10/hour) |
| 2 × Graviton nodes (`t4g.large`) | $100 |
| One NAT gateway | $35–45 + data |
| Load balancer | $20 |
| Stage 2: RDS + ElastiCache, smallest sizes | $25–35 |
| Stage 2: MSK, 2 small brokers | $70 |
| Stage 2: DocumentDB smallest / Atlas | $60 / free to low |
| S3, ECR, Secrets Manager, Route 53 | a few dollars, plus a domain (~$10–15/year) |

Always on, that is roughly **$230/month for stage 1 and $400/month for stage 2**.

**Recommendation until there are users:** bring the environment up with Terraform when you need
it and destroy it afterwards. The base costs about $0.30 an hour (EKS + nodes + NAT + load
balancer), and A0 sets a budget alarm.

### 9.4 Phases

**A0 — Groundwork.**

- Build:
  - AWS account basics: an IAM Identity Center user with MFA, and no use of the root account.
  - A budget alarm.
  - The Terraform state bucket.
  - A domain in Route 53.
  - Runtime frontend config.
- *Verify:* `terraform plan` runs clean, and the frontend image serves both origins with only env
  changes.

**A1 — ECR.**

- Build: the repositories (Terraform); Jenkins pushes every image to Docker Hub and to ECR.
- *Verify:* the same digest appears in both registries, and scan results are visible.

**A2 — EKS, stage 1.**

- Build:
  - The VPC, EKS and the Graviton nodes.
  - The AWS Load Balancer Controller.
  - Envoy Gateway with the NLB, ACM and Route 53.
  - External Secrets with Secrets Manager.
  - The Pod Identity roles and the real S3 buckets.
  - The datastores on EBS.
  - Argo CD.
- *Verify:*
  - The full D1 flow passes on `https://learnsphere.<domain>`.
  - A push rolls exactly one service via Argo CD.
  - `terraform destroy` leaves nothing billable.

**A3 — Managed data, one store per step.**

- Build, in this order: RDS → ElastiCache → MSK → Atlas or DocumentDB.
- *Verify after each step:* the flow still passes, and the StatefulSet that store replaced is
  removed.

**A4 — Production hardening.**

- CloudFront for HLS (transcoder Phase 4).
- Multi-AZ RDS and backups.
- HPA/KEDA and Karpenter.
- WAF.
- Metrics and alarms.
- SES for email.

---

## 10. Decisions needed from you

### Now, for local

1. **Option A or B (§2.3).** I recommend A, Jenkins on this Mac, which needs Docker Desktop
   raised to 12 GiB. Choose B, GitHub Actions + Argo CD, if that makes the Mac sluggish.
2. **Docker Hub username, and public or private repos.** I recommend public, five repos, since the
   code is already public. A free account has limited private repos; going private would mean one
   repo with service-prefixed tags.
3. **Origin.** I recommend `http://learnsphere.localhost` via `minikube tunnel`, which asks for
   sudo once. The alternative is `kubectl port-forward` on `:8088`, with no sudo.
4. **The three existing `deploy/` files.** Replace them in place (git history keeps them), or
   move them to `deploy/archive/`?
5. **App secrets.** I recommend keeping them out of Jenkins, as above. The alternative is making
   Jenkins the single source of every key.
6. **Ports.** The cluster uses each service's own default, 5000 and 7000. Should D0 also fix the
   frontend's dev fallbacks (5001 → 5000, 7070 → 7000), closing `ARCHITECTURE.md` §9 Q1–Q2?

### Before AWS (not needed yet)

7. **Region.** I recommend `ap-south-1` (Mumbai): it is close to your users, and Razorpay and INR
   pricing point there. `us-east-1` is cheaper, and new services launch there first.
8. **A domain for HTTPS**, e.g. `learnsphere.<domain>`, hosted in Route 53.
9. **Always on, or up per session.** I recommend up per session until there are users (§9.3).
10. **Mongo on AWS.** I recommend MongoDB Atlas on AWS, in the same region. notification-service
    is built against MongoDB 7, and DocumentDB implements only a subset of the MongoDB API; Atlas
    is also free to cheap at this size. DocumentDB is the choice if everything must be an AWS
    service.
11. **Delivery on AWS.** I recommend Jenkins → ECR with Argo CD deploying (§9.2). The
    alternatives are Jenkins running `kubectl` against EKS, which puts cloud cluster credentials
    on a laptop, or GitHub Actions with keyless OIDC.
