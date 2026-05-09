# What Are We Building? — Plain English Guide

---

## The Big Picture

We are building an **online learning platform** — think of it like Udemy or Coursera, but our own version.

Anyone can visit the website, browse courses, buy them, and learn at their own pace. Teachers (we call them "Instructors") can create and sell their own courses. A small team of Admins manages the whole platform behind the scenes.

---

## Who Uses This Platform?

There are three types of people on this platform:

### 1. Students
- Browse and search for courses
- Buy courses (or enroll for free if a course is free)
- Watch video lessons, read text lessons, take quizzes
- Track their progress through a course
- Leave reviews and ratings
- Ask questions in the Q&A section
- Get a certificate when they finish a course
- Share that certificate on LinkedIn

### 2. Instructors (Teachers)
- Apply to become an instructor
- Create courses — add videos, text lessons, quizzes
- Set a price for their course (or make it free)
- Submit their course for review before it goes live
- See how many students enrolled and how much money they made
- Answer student questions

### 3. Admins (The Platform Managers)
- Approve or reject instructor applications
- Review and publish (or reject) courses before they go live
- Manage all users — ban, unban, change roles
- Create discount coupons
- See overall platform statistics — total users, total money made, top courses

---

## How Does the Money Work?

When a student buys a course:
- **70%** of the payment goes to the Instructor
- **30%** stays with the Platform

This split is recorded permanently at the time of purchase. Even if the platform fee changes in the future, old purchases keep their original split — which is fair to both sides.

Payments are handled securely through **Stripe**, which is the same payment system used by companies like Amazon and Shopify.

---

## What Happens When Someone Uploads a Video?

Uploading a video triggers a whole behind-the-scenes process:

1. The instructor uploads the raw video file
2. Our system automatically converts it into multiple quality versions:
   - **240p** — for very slow internet
   - **480p** — for average internet
   - **720p** — for good internet
   - **1080p** — for fast internet
3. The student's video player automatically picks the best quality based on their internet speed at that moment — this is called **adaptive streaming**
4. The instructor gets a notification: "Your video is ready"

This means students never have to manually choose video quality — it adjusts automatically, just like YouTube does.

---

## Notifications — How Does the Bell Icon Work?

Every important event sends a notification to the right person:

| What Happens | Who Gets Notified |
|---|---|
| You register on the platform | You get a welcome message |
| You buy a course | You get a purchase confirmation |
| Your video finishes processing | You (instructor) get notified |
| You pass a quiz | You get a congratulations message |
| You finish a course | You get your certificate |
| Admin approves your instructor application | You get a welcome email |
| Admin rejects your application | You get an explanation email |
| Admin publishes your course | You (instructor) get notified |
| Admin rejects your course | You (instructor) get feedback |

Notifications appear instantly in the bell icon at the top of the page — no need to refresh. This is done using **WebSockets**, which is a technology that keeps a live connection open between your browser and our server (like a phone call that stays open, rather than sending individual text messages).

---

## How Do We Handle 100,000+ Users?

This is the "scalability" part — making sure the platform doesn't crash or slow down as more people join.

Here's how we solve each challenge, in plain terms:

---

### Challenge 1: The Database Gets Too Many Requests
**Problem:** Every time someone opens a course page, the system has to look up all the course details from the database. If 10,000 people open the same popular course at the same time, that's 10,000 identical database lookups.

**Solution — Smart Caching:**
We store the results of common lookups in a super-fast temporary memory called **Redis** (think of it like a sticky note on your desk vs. going to the filing cabinet every time). The first person's request hits the database; the next 9,999 people get the result from the sticky note. The sticky note expires after a few minutes and gets refreshed.

---

### Challenge 2: Videos Are Slow to Load
**Problem:** Videos stored in one place on the internet are slow to deliver to users who are physically far away.

**Solution — CDN (Content Delivery Network):**
We use **Amazon CloudFront**, which is a global network of servers spread across hundreds of cities worldwide. When a student in India plays a video, it's delivered from the nearest server in India — not from a server in the USA. This makes video playback fast and smooth for everyone, everywhere.

---

### Challenge 3: One Server Can't Handle Everyone
**Problem:** If the whole platform runs on one computer (server) and it crashes, everyone is kicked off. Also, one server can only handle so many users at once.

**Solution — Multiple Servers + Auto-Scaling:**
We use **Kubernetes on AWS** — imagine an automatic manager that watches how busy the servers are. When traffic spikes (e.g., a big sale), it automatically starts more servers. When traffic drops (e.g., 3 AM), it shuts extra servers down to save money. If one server crashes, the others keep running — users don't even notice.

---

### Challenge 4: Searching for Courses is Slow
**Problem:** Searching for "Python programming" across tens of thousands of courses requires scanning the entire database — which gets slower as more courses are added.

**Solution — Dedicated Search Engine:**
We use **Elasticsearch** (specifically Amazon's version called OpenSearch), which is a specialized tool built specifically for fast searching. It can handle fuzzy matches (e.g., "Pytohn" still finds "Python"), filters (price range, skill level, rating), and delivers results in under 50 milliseconds — 10x faster than a regular database search.

---

### Challenge 5: Bad Actors Abusing the System
**Problem:** Someone could write a script to try thousands of passwords on login, or spam the platform with fake accounts.

**Solution — Rate Limiting:**
We count how many times someone tries to do something (like login) from the same location. If they try too many times too fast, we temporarily block them. This works across all our servers simultaneously using **Redis** as a shared counter.

---

### Challenge 6: We Can't See What's Breaking
**Problem:** Without visibility into the system, we only find out something is wrong when users start complaining.

**Solution — Monitoring Dashboard:**
We set up **Prometheus and Grafana** — think of it as a live health dashboard for the entire platform, like the dashboard in a car showing speed, fuel, and engine temperature. We can see in real time how fast the servers are responding, how much memory they're using, and whether anything is about to break. Automatic alerts ping us before users even notice a problem.

---

## The Tech Stack — Simplified

Here's every technology we use and why, explained simply:

| Technology | What It Is | Why We Use It |
|---|---|---|
| **Next.js** | The framework that builds the website pages | Makes the website fast and SEO-friendly |
| **React** | The tool that makes web pages interactive | Industry standard for building modern UIs |
| **Tailwind CSS** | A styling toolkit | Makes the website look good quickly |
| **Redux** | Manages what the app "remembers" while you're using it | Keeps track of who's logged in, their cart, etc. |
| **NestJS** | The main server that handles all requests | Powers all the business logic (login, courses, payments) |
| **PostgreSQL** | The main database | Stores all structured data: users, courses, orders, enrollments |
| **Prisma** | A tool that talks to the database | Makes database queries safe and easy to write |
| **Redis** | Super-fast temporary memory | Caching, sessions, real-time counters, notification pub/sub |
| **Kafka** | A message queue system | Lets services talk to each other without waiting for a response |
| **FFmpeg** | Video processing software | Converts uploaded videos into multiple quality levels |
| **Spring Boot (Java)** | A separate server for notifications | Handles all notification logic — Java is great at this |
| **MongoDB** | A flexible database | Stores notifications (which don't have a fixed structure) |
| **Amazon S3** | Cloud file storage | Stores all uploaded videos and processed HLS files |
| **Amazon CloudFront** | Global content delivery | Delivers videos fast to users worldwide |
| **Amazon RDS** | Managed PostgreSQL on AWS | Runs the database reliably with automatic backups |
| **Amazon ElastiCache** | Managed Redis on AWS | Runs Redis reliably without us managing servers |
| **AWS OpenSearch** | Managed Elasticsearch on AWS | Powers the course search feature |
| **Amazon EKS** | Managed Kubernetes on AWS | Runs and auto-scales all our services |
| **Stripe** | Payment processing | Handles all credit card payments securely |
| **Prometheus** | Metrics collector | Collects data about how the system is performing |
| **Grafana** | Dashboard visualizer | Displays all metrics in beautiful, readable charts |
| **Docker** | Container technology | Packages each service so it runs the same everywhere |
| **Kubernetes** | Container orchestrator | Manages, scales, and heals all the Docker containers |
| **HLS.js** | Video player library | Plays adaptive streaming videos in the browser |
| **Socket.IO** | Real-time communication | Powers the live notification bell |
| **JWT** | Login tokens | Proves who you are to the server without re-entering your password |

---

## How the Services Talk to Each Other

The platform is split into four separate programs (called "services") that each do one job:

```
┌─────────────────────────────────────────────────┐
│                   STUDENT / INSTRUCTOR           │
│                  (uses the website)              │
└───────────────────────┬─────────────────────────┘
                        │
              ┌─────────▼──────────┐
              │   Website (Next.js) │  ← What you see in the browser
              └─────────┬──────────┘
                        │ talks to
              ┌─────────▼──────────┐
              │  Main Server       │  ← Handles login, courses,
              │  (NestJS)          │    payments, enrollments
              └──────┬──────┬──────┘
                     │      │
          ┌──────────▼─┐  ┌─▼──────────────────┐
          │  Video      │  │  Notification       │
          │  Transcoder │  │  Service            │
          │  (Node.js + │  │  (Spring Boot Java) │
          │   FFmpeg)   │  │                     │
          └──────┬──────┘  └─────────────────────┘
                 │
          ┌──────▼──────┐
          │  Amazon S3  │  ← Where all videos are stored
          └─────────────┘
```

They communicate by dropping messages into a shared queue called **Kafka** — like dropping a letter in a mailbox. The recipient picks it up and handles it in their own time. This means if the notification service is temporarily slow, the main server doesn't freeze waiting for it.

---

## The Journey of a Course — Start to Finish

Here's the complete story of a course on the platform:

1. **Instructor applies** → Admin approves → Instructor gets an email
2. **Instructor creates a course** → Starts as a "Draft" (invisible to students)
3. **Instructor uploads videos** → Videos are automatically converted to multiple qualities
4. **Instructor submits for review** → Status changes to "Under Review"
5. **Admin reviews and approves** → Course goes "Published" (visible to all students)
6. **Student finds the course** → Uses search or browsing
7. **Student buys the course** → Stripe processes payment → Instructor gets 70%, Platform gets 30%
8. **Student watches videos** → Progress is saved automatically
9. **Student takes quizzes** → Results are recorded, badges awarded for passing
10. **Student completes all lessons** → Certificate is automatically generated
11. **Student leaves a review** → Rating updates the course's average score

---

## In One Sentence

We are building a **production-grade online learning marketplace** — like Udemy — that can handle over 100,000 concurrent users, built with modern technologies and hosted on Amazon Web Services.
