import Image from 'next/image'

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-[#0a0a0a]">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 border-b border-white/[0.06] bg-[#0a0a0a]/80 backdrop-blur-xl">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Image
              src="/logo-192.png"
              alt="Dominus OS crest"
              width={32}
              height={32}
              className="rounded-full"
              priority
            />
            <div>
              <span className="text-[#fafafa] font-semibold text-[15px] tracking-tight">Dominus OS</span>
              <span className="hidden sm:inline text-[#a1a1aa] text-xs ml-2">Human-Governed Operating System</span>
            </div>
          </div>
          <div className="hidden md:flex items-center gap-6 text-[13px] text-[#a1a1aa]">
            <a href="#problem" className="hover:text-[#fafafa] transition-colors">The Problem</a>
            <a href="#the-os" className="hover:text-[#fafafa] transition-colors">The OS</a>
            <a href="#control-plane" className="hover:text-[#fafafa] transition-colors">Control Plane</a>
            <a href="#kill-switch" className="hover:text-[#fafafa] transition-colors">Kill Switch</a>
            <a href="#audience" className="hover:text-[#fafafa] transition-colors">Who It&apos;s For</a>
            <a href="#production" className="hover:text-[#fafafa] transition-colors">In Production</a>
            <a href="#founding" className="inline-flex items-center px-3 py-1.5 rounded-md bg-[#c9a84c]/10 text-[#c9a84c] hover:bg-[#c9a84c]/20 transition-colors">Founding Deployments</a>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="pt-32 pb-20 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-block mb-6">
            <span className="text-[#c9a84c] text-sm font-medium tracking-wide uppercase">Human-Governed Operating System</span>
          </div>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-[#fafafa] leading-tight tracking-tight mb-6">
            Run AI as accountable processes.<br className="hidden sm:block" /> See everything. Stop everything.
          </h1>
          <p className="text-[#a1a1aa] text-lg sm:text-xl leading-relaxed max-w-3xl mx-auto mb-10">
            Dominus OS is a sovereign execution layer where AI operates as managed, auditable processes under named human authority. It is not another AI product. It is an operating system — with a real kernel, managed processes, durable agents, and a governance framework that scales. Designed for organizations where someone must always be able to explain what happened, why, and who approved it.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <a
              href="#founding"
              className="px-6 py-3 rounded-lg bg-[#c9a84c] text-[#0a0a0a] font-semibold text-[15px] hover:bg-[#d4b85e] transition-colors"
            >
              Request a Founding Deployment
            </a>
            <a
              href="#control-plane"
              className="px-6 py-3 rounded-lg border border-white/20 text-[#fafafa] font-medium text-[15px] hover:bg-white/5 transition-colors"
            >
              See the Control Plane
            </a>
          </div>
        </div>
      </section>

      {/* Three Guarantees */}
      <section className="py-20 px-6 border-t border-white/[0.06]">
        <div className="max-w-6xl mx-auto">
          <span className="text-[#c9a84c] text-sm font-medium tracking-wide uppercase block text-center mb-12">Three system guarantees</span>
          <div className="grid md:grid-cols-3 gap-8">
            <div className="bg-[#141414] rounded-xl border border-white/[0.06] p-8">
              <h3 className="text-[#fafafa] text-lg font-semibold mb-3">Bounded Authority</h3>
              <p className="text-[#a1a1aa] text-[15px] leading-relaxed">
                The system cannot exceed approved scope. Boundaries are enforced by architecture, not policy. Every process runs inside an explicit envelope defined by a named human steward.
              </p>
            </div>
            <div className="bg-[#141414] rounded-xl border border-white/[0.06] p-8">
              <h3 className="text-[#fafafa] text-lg font-semibold mb-3">Attributable Action</h3>
              <p className="text-[#a1a1aa] text-[15px] leading-relaxed">
                Every action traces to human authorization. Every record carries source, timestamp, evidence, and an unbroken chain of attribution. An auditor could reconstruct the full path from any outcome to the action that started it.
              </p>
            </div>
            <div className="bg-[#141414] rounded-xl border border-white/[0.06] p-8">
              <h3 className="text-[#fafafa] text-lg font-semibold mb-3">Governed Learning</h3>
              <p className="text-[#a1a1aa] text-[15px] leading-relaxed">
                The system improves over time — but improvement requires human consent. Every proposed change is reviewable, reversible, and gated by explicit authority. Evolution inside governance, not outside it.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* The Problem */}
      <section id="problem" className="py-20 px-6 border-t border-white/[0.06]">
        <div className="max-w-4xl mx-auto">
          <span className="text-[#c9a84c] text-sm font-medium tracking-wide uppercase block mb-4">The Problem</span>
          <h2 className="text-3xl sm:text-4xl font-bold text-[#fafafa] leading-tight tracking-tight mb-6">
            Systems that act without governance erode trust. Systems that cannot learn erode value.
          </h2>
          <div className="text-[#a1a1aa] text-[16px] leading-relaxed space-y-4">
            <p>
              Most AI tools force a choice between power and accountability. Either systems act too freely — creating legal, ethical, and operational risk — or they are locked down so tightly they cannot adapt to real work. As organizations scale AI, the cost of this gap is carried by operators and executives who must still answer for outcomes they did not directly control. The result is fragile automation, unclear responsibility, and growing resistance to adoption.
            </p>
            <p>
              Most stacks can automate tasks. Almost none can prove what happened end-to-end, tie actions to outcomes, and keep authority intact while the system gets smarter.
            </p>
          </div>
        </div>
      </section>

      {/* The OS */}
      <section id="the-os" className="py-20 px-6 border-t border-white/[0.06]">
        <div className="max-w-4xl mx-auto">
          <span className="text-[#c9a84c] text-sm font-medium tracking-wide uppercase block mb-4">The Operating System</span>
          <h2 className="text-3xl sm:text-4xl font-bold text-[#fafafa] leading-tight tracking-tight mb-6">
            Not an agent. Not a chatbot. An operating system.
          </h2>
          <div className="text-[#a1a1aa] text-[16px] leading-relaxed space-y-4">
            <p>
              Dominus OS is a sovereign computing layer with a real kernel, managed processes, durable agents, and a governance framework that scales. A Node.js kernel orchestrates execution across 150+ API endpoints. Seven Virtual Employees execute real work with real tools — email, databases, deployments, integrations — all within governed envelopes. Every subsystem feeds intelligence to every other subsystem through a shared signal bus. The result is combinatorial: each new domain added multiplies the intelligence of every domain already connected.
            </p>
            <p>
              The operator surface is a native macOS application built in Swift — not Electron, not a browser wrapper. A real desktop client connected to the kernel via HTTP and WebSocket, with live process visibility, tab-based task management, and direct kill authority. The same kernel serves a full web-based CRM for field teams and a webhook integration layer for third-party services. One kernel, multiple governed surfaces.
            </p>
          </div>
        </div>
      </section>

      {/* Control Plane */}
      <section id="control-plane" className="py-20 px-6 border-t border-white/[0.06]">
        <div className="max-w-4xl mx-auto">
          <span className="text-[#c9a84c] text-sm font-medium tracking-wide uppercase block mb-4">Control Plane</span>
          <h2 className="text-3xl sm:text-4xl font-bold text-[#fafafa] leading-tight tracking-tight mb-6">
            A full dashboard for every AI process in your organization.
          </h2>
          <div className="text-[#a1a1aa] text-[16px] leading-relaxed space-y-4">
            <p>
              Dominus OS gives the operator a single surface to see what&apos;s running, what&apos;s queued, what changed, and what every process touched. Live status, run history, data provenance, and authority boundaries — all in one view. Not scattered across ten vendor dashboards. One control plane, one truth.
            </p>
            <p>
              Every process registers on the process ledger or it does not run. Forty scheduled jobs execute autonomously under governance. Every write operation passes through a Canon Gate — an explicit authority checkpoint where the human governs and the system executes. The boundary is structural, not behavioral.
            </p>
          </div>
        </div>
      </section>

      {/* Kill Switch */}
      <section id="kill-switch" className="py-20 px-6 border-t border-white/[0.06]">
        <div className="max-w-4xl mx-auto">
          <span className="text-[#c9a84c] text-sm font-medium tracking-wide uppercase block mb-4">Kill Switch</span>
          <h2 className="text-3xl sm:text-4xl font-bold text-[#fafafa] leading-tight tracking-tight mb-6">
            One action halts every AI process. Instantly. Visibly.
          </h2>
          <div className="text-[#a1a1aa] text-[16px] leading-relaxed space-y-4">
            <p>
              Dominus OS enforces a system-level halt that stops all AI-driven execution across every subsystem. No silent continuation. No orphaned processes running in the background. The system fails safe — and the operator sees it happen in real time, with a full audit trail of what was stopped and why.
            </p>
            <p>
              This is the guarantee that makes everything else trustworthy. If you cannot stop it, you do not govern it. Dominus OS makes halt authority a first-class feature of the operating system — not a panic button buried in settings, but a structural capability the operator holds at all times.
            </p>
          </div>
        </div>
      </section>

      {/* Authority Structure */}
      <section className="py-20 px-6 border-t border-white/[0.06]">
        <div className="max-w-6xl mx-auto">
          <span className="text-[#c9a84c] text-sm font-medium tracking-wide uppercase block text-center mb-4">Authority Structure</span>
          <h2 className="text-3xl sm:text-4xl font-bold text-[#fafafa] leading-tight tracking-tight mb-12 text-center">
            A simple structure that scales.
          </h2>
          <div className="grid md:grid-cols-3 gap-8">
            <div className="bg-[#141414] rounded-xl border border-white/[0.06] p-8">
              <h3 className="text-[#fafafa] text-lg font-semibold mb-3">Mandate</h3>
              <p className="text-[#a1a1aa] text-[15px] leading-relaxed">
                Mandate defines intent and non-negotiable boundaries set by leadership, policy, or regulation. In Dominus OS, this is the Canon — immutable limits that AI processes cannot cross regardless of context.
              </p>
            </div>
            <div className="bg-[#141414] rounded-xl border border-white/[0.06] p-8">
              <h3 className="text-[#fafafa] text-lg font-semibold mb-3">Operational Oversight</h3>
              <p className="text-[#a1a1aa] text-[15px] leading-relaxed">
                Operational Oversight interprets that mandate in real time, authorizing scopes, approving behaviors, and issuing overrides when necessary. The Canon Gate enforces this at the system level for every write, deploy, and financial action.
              </p>
            </div>
            <div className="bg-[#141414] rounded-xl border border-white/[0.06] p-8">
              <h3 className="text-[#fafafa] text-lg font-semibold mb-3">Execution</h3>
              <p className="text-[#a1a1aa] text-[15px] leading-relaxed">
                Execution is where Virtual Employees, agents, and integrations act — always within approved envelopes, always recorded in the process ledger, always attributable to the human who authorized the scope.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Who It's For */}
      <section id="audience" className="py-20 px-6 border-t border-white/[0.06]">
        <div className="max-w-4xl mx-auto">
          <span className="text-[#c9a84c] text-sm font-medium tracking-wide uppercase block mb-4">Who It&apos;s For</span>
          <h2 className="text-3xl sm:text-4xl font-bold text-[#fafafa] leading-tight tracking-tight mb-6">
            Built for people who must account for every decision.
          </h2>
          <p className="text-[#a1a1aa] text-[16px] leading-relaxed">
            Dominus OS is built for operators, founders, and executives who cannot afford black boxes — and cannot afford to slow down to avoid them. It assumes that someone must always be able to explain what happened, why it happened, and who was responsible, regardless of which domain the action occurred in. Governance is not bolted on after the fact; it is embedded into how systems are built, deployed, and improved.
          </p>
        </div>
      </section>

      {/* Sovereignty */}
      <section className="py-20 px-6 border-t border-white/[0.06]">
        <div className="max-w-4xl mx-auto">
          <span className="text-[#c9a84c] text-sm font-medium tracking-wide uppercase block mb-4">The Foundation</span>
          <h2 className="text-3xl sm:text-4xl font-bold text-[#fafafa] leading-tight tracking-tight mb-6">
            Built for sovereignty, not surveillance.
          </h2>
          <div className="text-[#a1a1aa] text-[16px] leading-relaxed space-y-4">
            <p>
              Most AI systems are designed to learn from you in ways that serve their creators. Dominus OS inverts this. The constitutional architecture makes unauthorized data extraction structurally impossible — not because we promise not to, but because the system doesn&apos;t allow it. Your data, your processes, your intelligence. Sovereign by design.
            </p>
            <p>
              For people who must protect discretion, confidentiality, and fiduciary duty, this isn&apos;t a feature. It&apos;s the reason to choose Dominus OS.
            </p>
          </div>
        </div>
      </section>

      {/* In Production */}
      <section id="production" className="py-20 px-6 border-t border-white/[0.06]">
        <div className="max-w-4xl mx-auto">
          <span className="text-[#c9a84c] text-sm font-medium tracking-wide uppercase block mb-4">In Production</span>
          <h2 className="text-3xl sm:text-4xl font-bold text-[#fafafa] leading-tight tracking-tight mb-6">
            Running live. Not a whitepaper.
          </h2>
          <div className="text-[#a1a1aa] text-[16px] leading-relaxed space-y-4">
            <p>
              Dominus OS is not a proposal or a prototype. It is running in production — orchestrating outbound sales operations, email attribution, compliance enforcement, and revenue intelligence for a multi-rep service business. Seven Virtual Employees execute daily tasks with real tools across 150+ API endpoints. Forty scheduled jobs run autonomously under governance. An immutable activity ledger captures every action with source, evidence, and full attribution chain. The learning engine improves weekly under explicit authority. The kill switch is tested regularly.
            </p>
            <p>
              The architecture — immutable ledger, full-chain attribution, cross-domain signal bus, governed learning loop — is a deployable pattern. Any multi-domain operation that needs accountability, cross-domain intelligence, and AI governance can run a version of this. The pattern scales. The philosophy does not compromise.
            </p>
          </div>
        </div>
      </section>

      {/* Competitive Landscape */}
      <section className="py-20 px-6 border-t border-white/[0.06]">
        <div className="max-w-4xl mx-auto">
          <span className="text-[#c9a84c] text-sm font-medium tracking-wide uppercase block mb-4">Competitive Landscape</span>
          <h2 className="text-3xl sm:text-4xl font-bold text-[#fafafa] leading-tight tracking-tight mb-6">
            Where Dominus OS sits — and what it replaces.
          </h2>
          <div className="text-[#a1a1aa] text-[16px] leading-relaxed space-y-6">
            <p>Most organizations assemble a patchwork of tools that each solve one problem. None of them solve the governance problem.</p>
            <div>
              <p className="text-[#fafafa] font-semibold mb-1">Automation platforms</p>
              <p>connect systems — they move data between services. They don&apos;t enforce authority boundaries, maintain audit-grade provenance, or provide a single kill switch when something goes wrong. When AI agents run inside them, no one controls the scope.</p>
            </div>
            <div>
              <p className="text-[#fafafa] font-semibold mb-1">Agent frameworks</p>
              <p>let AI call functions and produce outputs. Most lack hard authority boundaries, durable process identity, and the ability to trace any outcome to the human who approved it. When the agent drifts, no structural failsafe exists.</p>
            </div>
            <div>
              <p className="text-[#fafafa] font-semibold mb-1">Traditional CRMs</p>
              <p>track activity and pipeline. They don&apos;t provide immutable ledgers, full-funnel attribution from origin action to closed deal, or learning loops that improve under governance. History can be rewritten. The chain cannot be audited.</p>
            </div>
            <div>
              <p className="text-[#fafafa] font-semibold mb-1">Observability dashboards</p>
              <p>show you what happened. They don&apos;t control what&apos;s allowed to happen next. They observe — they don&apos;t govern.</p>
            </div>
            <div>
              <p className="text-[#c9a84c] font-semibold mb-1">Dominus OS</p>
              <p>operates at the layer where execution, authority, and accountability converge. Execute, govern, prove, halt — in one system. Not bolted on. Built in.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Founding Deployments */}
      <section id="founding" className="py-20 px-6 border-t border-white/[0.06]">
        <div className="max-w-4xl mx-auto text-center">
          <span className="text-[#c9a84c] text-sm font-medium tracking-wide uppercase block mb-4">Founding Deployments</span>
          <h2 className="text-3xl sm:text-4xl font-bold text-[#fafafa] leading-tight tracking-tight mb-6">
            Shape how AI governance gets built.
          </h2>
          <p className="text-[#a1a1aa] text-[16px] leading-relaxed max-w-2xl mx-auto mb-10">
            We are deploying Dominus OS with a small number of organizations — not just to implement governance, but to prove the pattern at scale. Founding partners get hands-on deployment, direct architectural input, and favorable terms. If you are responsible for outcomes, oversight, or the future of intelligent systems in your organization, we want to talk.
          </p>
          <a
            href="mailto:mark@dominusfoundry.com?subject=Dominus%20OS%20—%20Founding%20Deployment"
            className="inline-flex items-center px-8 py-4 rounded-lg bg-[#c9a84c] text-[#0a0a0a] font-semibold text-[16px] hover:bg-[#d4b85e] transition-colors"
          >
            Start a Conversation
          </a>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 px-6 border-t border-white/[0.06]">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Image
              src="/logo-192.png"
              alt="Dominus OS crest"
              width={24}
              height={24}
              className="rounded-full"
            />
            <span className="text-[#fafafa] font-semibold text-[14px]">Dominus OS</span>
          </div>
          <p className="text-[#71717a] text-[13px] text-center sm:text-right">
            Dominus OS is the originator of the Human-Governed Intelligence standard. A Dominus Foundry venture.
          </p>
        </div>
      </footer>
    </main>
  )
}
