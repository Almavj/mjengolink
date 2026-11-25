import {
  Activity,
  ArrowUpRight,
  Bell,
  BriefcaseBusiness,
  CalendarDays,
  Camera,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  ClipboardList,
  Clock3,
  Eye,
  EyeOff,
  FileText,
  Flag,
  Hammer,
  LayoutDashboard,
  LockKeyhole,
  MapPin,
  MapPinned,
  Menu,
  MessageCircle,
  MoreHorizontal,
  Paintbrush,
  Phone,
  Plus,
  Radio,
  RefreshCcw,
  Search,
  Send,
  ShieldCheck,
  SlidersHorizontal,
  Star,
  Trash2,
  TrendingUp,
  Users,
  Wrench,
  X,
  Zap,
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

type Role = "client" | "fundi" | "admin";
type NavKey = "overview" | "jobs" | "fundis" | "history" | "responses" | "profile" | "reports";
type JobStatus = "Posted" | "Interested" | "Accepted" | "Assigned" | "In progress" | "Completed" | "Cancelled";

type Fundi = {
  id: string;
  name: string;
  email: string;
  trade: string;
  trades: string[];
  location: string;
  distance: string;
  experience: string;
  rating: number;
  ratings: number;
  initials: string;
  tone: string;
  response: string;
  available: boolean;
  note: string;
  avatarUrl?: string | null;
};

type Job = {
  id: string;
  title: string;
  trade: string;
  location: string;
  distance: string;
  budget: string;
  startDate: string;
  status: JobStatus;
  description: string;
  posted: string;
  matched: number;
  interested: number;
  responders: string[];
  client: string;
  clientId?: number;
};

type Report = {
  id: string;
  subject: string;
  type: string;
  reason: string;
  date: string;
  status: "Review" | "Resolved";
};

type Store = { jobs: Job[]; fundis: Fundi[]; reports: Report[]; metrics: { registeredUsers: number; fundiUsers: number; clientUsers: number; jobsPosted: number; openJobs: number; completedJobs: number; openReports: number; fundisWithTrade: number; jobsWithLocation: number; ratedJobs: number }; accounts: { id: number; name: string; role: string; email: string; status: "Active" }[] };
type ProfileForm = { phone: string; experience: string; serviceArea: string; availability: boolean; summary: string; trades: string[] };
type JobResponderView = Fundi & { workerId: number; userId: number; responseId: number; responseStatus: string };
type InboxConversationView = { id: number; jobId: string; jobTitle: string; otherParty: string; otherPartyRole: "client" | "fundi"; lastMessage: string; lastMessageAt: string; unreadCount: number };
type InboxMessageView = { id: number; senderId: number; senderName: string; body: string; createdAt: string; mine: boolean };
type AppNotificationView = { id: number; type: string; title: string; body: string; jobId: string | null; conversationId: number | null; isRead: boolean; createdAt: string };


const trades = ["All trades", "Masonry", "Plumbing", "Electrical", "Painting", "Carpentry", "Welding"];
const statuses: JobStatus[] = ["Posted", "Interested", "Accepted", "Assigned", "In progress", "Completed", "Cancelled"];
const navByRole: Record<Role, { key: NavKey; label: string; icon: typeof LayoutDashboard }[]> = {
  client: [
    { key: "overview", label: "Overview", icon: LayoutDashboard },
    { key: "jobs", label: "My jobs", icon: ClipboardList },
    { key: "fundis", label: "Find fundis", icon: Users },
    { key: "history", label: "Work history", icon: Clock3 },
  ],
  fundi: [
    { key: "overview", label: "Kazi board", icon: LayoutDashboard },
    { key: "responses", label: "My responses", icon: Send },
    { key: "history", label: "Work history", icon: Clock3 },
    { key: "profile", label: "My profile", icon: Users },
  ],
  admin: [
    { key: "overview", label: "Control room", icon: LayoutDashboard },
    { key: "jobs", label: "Accounts & jobs", icon: ClipboardList },
    { key: "reports", label: "Reports", icon: Flag },
  ],
};

const emptyStore: Store = { jobs: [], fundis: [], reports: [], metrics: { registeredUsers: 0, fundiUsers: 0, clientUsers: 0, jobsPosted: 0, openJobs: 0, completedJobs: 0, openReports: 0, fundisWithTrade: 0, jobsWithLocation: 0, ratedJobs: 0 }, accounts: [] };
const todayLabel = new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });

function moneyAmount(value: string) {
  return value.replace("KSh ", "");
}

function initialsFromName(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function statusClass(status: JobStatus) {
  return status.toLowerCase().replace(" ", "-");
}

function BrandMark() {
  return (
    <div className="brand-lockup">
      <div className="brand-mark" aria-hidden="true">
        <span />
        <span />
        <i />
      </div>
      <div>
        <div className="brand-name">Mjengo<span>Link</span></div>
        <div className="brand-tag">Kazi karibu na wewe</div>
      </div>
    </div>
  );
}

function Avatar({ initials, tone = "green", size = "normal", src }: { initials: string; tone?: string; size?: "normal" | "large"; src?: string | null }) {
  return <div className={`avatar avatar-${tone} avatar-${size}`} style={src ? { backgroundImage: `url(${src})`, backgroundSize: "cover", backgroundPosition: "center" } : undefined}>{src ? "" : initials}</div>;
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <div className="field-label">{children}</div>;
}

function StatusPill({ status }: { status: JobStatus }) {
  return <span className={`status-pill status-${statusClass(status)}`}><span className="status-dot" />{status}</span>;
}

function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="empty-state">
      <div className="empty-icon"><ClipboardList size={20} /></div>
      <strong>{title}</strong>
      <p>{description}</p>
    </div>
  );
}

function storeFromDashboard(data: { jobs: Array<Omit<Job, "status"> & { status: string }>; fundis: Fundi[]; reports: Array<Omit<Report, "status"> & { status: string }>; metrics: Store["metrics"]; accounts: Store["accounts"] }): Store {
  const validStatuses: JobStatus[] = ["Posted", "Interested", "Accepted", "Assigned", "In progress", "Completed", "Cancelled"];
  return {
    jobs: data.jobs.map((job) => ({ ...job, status: validStatuses.includes(job.status as JobStatus) ? job.status as JobStatus : "Posted" })),
    fundis: data.fundis,
    reports: data.reports.map((report) => ({ ...report, status: report.status === "Resolved" ? "Resolved" : "Review" })),
    metrics: data.metrics,
    accounts: data.accounts,
  };
}

function Home() {
  const meQuery = trpc.auth.me.useQuery(undefined, { retry: false, refetchOnWindowFocus: false });
  const me = meQuery.data;
  const role: Role | null = me?.role === "admin" || me?.role === "client" || me?.role === "fundi" ? me.role : null;
  const dashboardQuery = trpc.dashboard.useQuery(undefined, { enabled: Boolean(me && role), retry: false });
  const profileQuery = trpc.profile.me.useQuery(undefined, { enabled: role === "fundi", retry: false });
  const utils = trpc.useUtils();
  const queryClient = useQueryClient();
  const setRoleMutation = trpc.auth.setRole.useMutation({ onSuccess: () => { void utils.auth.me.invalidate(); } });
  const createJobMutation = trpc.jobs.create.useMutation({ onSuccess: () => { void utils.dashboard.invalidate(); } });
  const updateJobMutation = trpc.jobs.update.useMutation({ onSuccess: () => { void utils.dashboard.invalidate(); } });
  const updateStatusMutation = trpc.jobs.updateStatus.useMutation({ onSuccess: () => { void utils.dashboard.invalidate(); } });
  const respondMutation = trpc.jobs.respond.useMutation({ onSuccess: () => { void utils.dashboard.invalidate(); } });
  const decideResponseMutation = trpc.jobs.decideResponse.useMutation({ onSuccess: () => { void utils.dashboard.invalidate(); void utils.jobs.responses.invalidate(); void utils.inbox.list.invalidate(); } });
  const rateMutation = trpc.jobs.rate.useMutation({ onSuccess: () => { void utils.dashboard.invalidate(); } });
  const availabilityMutation = trpc.profile.availability.useMutation({ onSuccess: () => { void utils.dashboard.invalidate(); } });
  const profileUpdateMutation = trpc.profile.update.useMutation({ onSuccess: () => { void utils.dashboard.invalidate(); void profileQuery.refetch(); } });
  const resolveReportMutation = trpc.admin.resolveReport.useMutation({ onSuccess: () => { void utils.dashboard.invalidate(); } });
  const logoutMutation = trpc.auth.logout.useMutation({ onSuccess: async () => { queryClient.clear(); window.location.replace("/"); } });
  const photoMutation = trpc.profile.updatePhoto.useMutation({ onSuccess: async () => { await utils.auth.me.invalidate(); await utils.dashboard.invalidate(); flash("Profile photo updated."); }, onError: mutationError });
  const removePhotoMutation = trpc.profile.removePhoto.useMutation({ onSuccess: async () => { await utils.auth.me.invalidate(); await utils.dashboard.invalidate(); flash("Profile photo removed."); }, onError: mutationError });
  const inboxQuery = trpc.inbox.list.useQuery(undefined, { enabled: Boolean(me && role), retry: false });
  const openChatMutation = trpc.inbox.open.useMutation({ onSuccess: async result => { await utils.inbox.list.invalidate(); setReviewJob(null); setSelectedConversationId(result.conversationId); setShowInbox(true); }, onError: mutationError });
  const sendMessageMutation = trpc.inbox.send.useMutation();
  const markReadMutation = trpc.inbox.markRead.useMutation({ onSuccess: () => { void utils.inbox.list.invalidate(); void utils.notifications.list.invalidate(); } });
  const notificationsQuery = trpc.notifications.list.useQuery(undefined, { enabled: Boolean(me && role), retry: false, refetchInterval: 10_000 });
  const markNotificationReadMutation = trpc.notifications.markRead.useMutation({ onSuccess: () => { void utils.notifications.list.invalidate(); } });
  const markAllNotificationsReadMutation = trpc.notifications.markAllRead.useMutation({ onSuccess: () => { void utils.notifications.list.invalidate(); } });
  const [activeNav, setActiveNav] = useState<NavKey>("overview");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [showJobModal, setShowJobModal] = useState(false);
  const [editingJob, setEditingJob] = useState<Job | null>(null);
  const [showRatingModal, setShowRatingModal] = useState<Job | null>(null);
  const [showAccountPanel, setShowAccountPanel] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [selectedFundi, setSelectedFundi] = useState<Fundi | null>(null);
  const [reviewJob, setReviewJob] = useState<Job | null>(null);
  const [showInbox, setShowInbox] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [selectedConversationId, setSelectedConversationId] = useState<number | null>(null);
  const [chatDraft, setChatDraft] = useState("");
  const [notice, setNotice] = useState("");
  const [fundiSearch, setFundiSearch] = useState("");
  const [jobSearch, setJobSearch] = useState("");
  const [tradeFilter, setTradeFilter] = useState("All trades");
  const [available, setAvailable] = useState(true);
  const [profileForm, setProfileForm] = useState<ProfileForm>({ phone: "", experience: "", serviceArea: "", availability: true, summary: "", trades: ["Masonry"] });
  const [jobForm, setJobForm] = useState({ trade: "Masonry", title: "", description: "", location: "", budget: "", startDate: "", contact: "Call me" });

  function flash(message: string) { setNotice(message); window.setTimeout(() => setNotice(""), 2800); }
  function mutationError(error: unknown) { flash(error instanceof Error ? error.message : "That action could not be completed. Try again."); }
  useEffect(() => {
    const profile = profileQuery.data;
    if (!profile) return;
    setAvailable(Boolean(profile.profile.availability));
    setProfileForm({ phone: profile.profile.phone ?? "", experience: profile.profile.experience ?? "", serviceArea: profile.profile.serviceArea, availability: Boolean(profile.profile.availability), summary: profile.profile.summary ?? "", trades: profile.skills.length ? profile.skills : ["Masonry"] });
  }, [profileQuery.data]);
  useEffect(() => {
    if (profileQuery.data || !me?.location) return;
    setProfileForm(form => ({ ...form, serviceArea: me.location ?? form.serviceArea }));
    setJobForm(form => ({ ...form, location: form.location || (me.location ?? "") }));
  }, [me?.location, profileQuery.data]);
  const responsesQuery = trpc.jobs.responses.useQuery({ jobId: reviewJob?.id ?? "" }, { enabled: Boolean(reviewJob), retry: false });
  const selectedConversation = inboxQuery.data?.find(item => item.id === selectedConversationId) ?? null;
  const messagesQuery = trpc.inbox.messages.useQuery({ conversationId: selectedConversationId ?? 0 }, { enabled: Boolean(selectedConversationId), retry: false });
  const store = dashboardQuery.data ? storeFromDashboard(dashboardQuery.data) : emptyStore;
  const displayName = me?.name ?? me?.email ?? "MjengoLink member";
  const currentFundi: Fundi | null = store.fundis.find((fundi) => fundi.email && me?.email && fundi.email.toLowerCase() === me.email.toLowerCase())
    ?? (profileQuery.data ? {
      id: `worker-${profileQuery.data.profile.id}`,
      name: displayName,
      email: me?.email ?? "",
      trade: profileQuery.data.skills[0] ?? "General construction",
      trades: profileQuery.data.skills.length ? profileQuery.data.skills : ["General construction"],
      location: profileQuery.data.profile.serviceArea,
      distance: "Area match",
      experience: profileQuery.data.profile.experience ?? "Experience not yet added",
      rating: 0,
      ratings: 0,
      initials: initialsFromName(displayName),
      tone: "green",
      response: "Response history will appear after activity",
      available: Boolean(profileQuery.data.profile.availability),
      note: profileQuery.data.profile.summary ?? "Add a work summary so clients know what you do.",
      avatarUrl: me?.avatarUrl ?? null,
    } : null);
  const clientJobs = store.jobs.filter((job) => role === "client" ? job.clientId === me?.id : true);
  const activeJobs = clientJobs.filter((job) => !["Completed", "Cancelled"].includes(job.status));
  const completedJobs = clientJobs.filter((job) => job.status === "Completed");
  const unreadCount = (notificationsQuery.data ?? []).filter(item => !item.isRead).length;
  const notificationToastBaseline = useRef<number | null>(null);
  useEffect(() => {
    const current = unreadCount;
    const previous = notificationToastBaseline.current;
    notificationToastBaseline.current = current;
    if (previous !== null && current > previous) {
      toast.info(`${current - previous} new notification${current - previous === 1 ? "" : "s"}`, { id: "new-notification", duration: 6000 });
    }
  }, [unreadCount]);
  const fundiJobs = useMemo(() => { const query = jobSearch.trim().toLowerCase(); return store.jobs.filter((job) => (tradeFilter === "All trades" || job.trade === tradeFilter) && (!query || `${job.title} ${job.location} ${job.trade}`.toLowerCase().includes(query)) && !["Completed", "Cancelled"].includes(job.status)); }, [jobSearch, store.jobs, tradeFilter]);
  const filteredFundis = store.fundis.filter((fundi) => { const query = fundiSearch.trim().toLowerCase(); return !query || `${fundi.name} ${fundi.trade} ${fundi.location} ${fundi.trades.join(" ")}`.toLowerCase().includes(query); });

  if (meQuery.isLoading) return <AuthFrame><div className="auth-card"><BrandMark /><div className="auth-loading"><span className="live-dot" />Loading your MjengoLink workspace…</div></div></AuthFrame>;
  if (meQuery.error) return <AuthFrame><div className="auth-card"><BrandMark /><h1>We could not check your session.</h1><p>{meQuery.error.message}</p><button className="outline-button" onClick={() => void meQuery.refetch()}><RefreshCcw size={16} />Try again</button></div></AuthFrame>;
  if (!me) return <LoginForm />;
  if (!role) return <AuthFrame><div className="auth-card"><BrandMark /><div className="eyebrow"><span className="eyebrow-line" />ONE LAST STEP</div><h1>How will you use MjengoLink?</h1><p>Choose the workspace that fits this account. Your role is saved securely to your account.</p><div className="onboarding-options"><button className="onboarding-option" disabled={setRoleMutation.isPending} onClick={() => setRoleMutation.mutate({ role: "client" })}><BriefcaseBusiness size={21} /><span><strong>I need work done</strong><small>Post jobs and find fundis</small></span><ChevronRight size={17} /></button><button className="onboarding-option" disabled={setRoleMutation.isPending} onClick={() => setRoleMutation.mutate({ role: "fundi" })}><Hammer size={21} /><span><strong>I offer construction services</strong><small>Find nearby kazi and respond</small></span><ChevronRight size={17} /></button></div>{setRoleMutation.error && <div className="auth-error">{setRoleMutation.error.message}</div>}</div></AuthFrame>;
  if (dashboardQuery.isLoading) return <AuthFrame><div className="auth-card"><BrandMark /><div className="auth-loading"><span className="live-dot" />Syncing your workspace…</div></div></AuthFrame>;
  if (dashboardQuery.error) return <AuthFrame><div className="auth-card"><BrandMark /><h1>We could not load your workspace.</h1><p>{dashboardQuery.error.message}</p><button className="outline-button" onClick={() => void dashboardQuery.refetch()}><RefreshCcw size={16} />Try again</button></div></AuthFrame>;

  const currentNav = navByRole[role];
  const pageTitle = role === "client" ? (activeNav === "overview" ? `Morning, ${displayName.split(" ")[0]}` : currentNav.find((item) => item.key === activeNav)?.label ?? "Overview") : role === "fundi" ? (activeNav === "overview" ? "Kazi board" : currentNav.find((item) => item.key === activeNav)?.label ?? "Kazi board") : (activeNav === "overview" ? "Control room" : currentNav.find((item) => item.key === activeNav)?.label ?? "Control room");
  const advanceStatus = (jobId: string) => { const job = store.jobs.find((item) => item.id === jobId); if (!job) return; const next = statuses[Math.min(statuses.indexOf(job.status) + 1, statuses.length - 1)]; if (next === job.status || ["Cancelled", "Completed"].includes(job.status)) return; updateStatusMutation.mutate({ jobId, status: next }, { onSuccess: () => flash("Job status updated — the next step is now visible."), onError: mutationError }); };
  const cancelJob = (jobId: string) => updateStatusMutation.mutate({ jobId, status: "Cancelled" }, { onSuccess: () => flash("Job cancelled. Matching fundis will no longer see it as open."), onError: mutationError });
  const respondToJob = (job: Job) => respondMutation.mutate({ jobId: job.id }, { onSuccess: () => flash(`Interest sent for ${job.id}. The client can now review your profile.`), onError: mutationError });
  const decideResponse = (workerId: number, decision: "accept" | "decline") => {
    if (!reviewJob) return;
    decideResponseMutation.mutate({ jobId: reviewJob.id, workerId, decision }, {
      onSuccess: () => flash(decision === "accept" ? "Fundi accepted. You can now open the private chat." : "That response was declined."),
      onError: mutationError,
    });
  };
  const openConversation = (conversationId: number) => {
    setSelectedConversationId(conversationId);
    setChatDraft("");
    markReadMutation.mutate({ conversationId });
  };
  const openNotification = (notification: AppNotificationView) => {
    markNotificationReadMutation.mutate({ id: notification.id });
    setShowNotifications(false);
    if (notification.conversationId) {
      openConversation(notification.conversationId);
      setShowInbox(true);
      return;
    }
    if (notification.type === "job") {
      setActiveNav("overview");
      return;
    }
    if (notification.jobId && role === "client") {
      const job = store.jobs.find(item => item.id === notification.jobId);
      if (job) {
        setReviewJob(job);
        return;
      }
    }
    setActiveNav(role === "fundi" ? "responses" : "jobs");
  };
  const sendChat = (event: FormEvent) => {
    event.preventDefault();
    if (!selectedConversationId || !chatDraft.trim()) return;
    const body = chatDraft.trim();
    sendMessageMutation.mutate({ conversationId: selectedConversationId, body }, {
      onSuccess: async () => { setChatDraft(""); await utils.inbox.messages.invalidate(); await utils.inbox.list.invalidate(); },
      onError: mutationError,
    });
  };
  const selectPhoto = (file: File | undefined) => {
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      flash("Choose a JPG, PNG or WebP image.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") photoMutation.mutate({ photo: reader.result, contentType: file.type as "image/jpeg" | "image/png" | "image/webp" });
    };
    reader.onerror = () => flash("That photo could not be read. Try another image.");
    reader.readAsDataURL(file);
  };
  const resolveReport = (id: string) => resolveReportMutation.mutate({ reportId: id }, { onSuccess: () => flash("Report marked as resolved."), onError: mutationError });
  const submitJob = async (event: FormEvent) => { event.preventDefault(); if (!jobForm.title.trim() || !jobForm.description.trim() || !jobForm.budget.trim() || !jobForm.startDate) { flash("Add a title, brief, budget and start date to save the job."); return; } try { const payload = { title: jobForm.title, trade: jobForm.trade as "Masonry" | "Plumbing" | "Electrical" | "Painting" | "Carpentry" | "Welding", description: jobForm.description, locationText: jobForm.location, budget: jobForm.budget, startDate: jobForm.startDate, contactPreference: jobForm.contact === "Call me" ? "Call me" as const : jobForm.contact === "Text me" ? "Text me" as const : "Either" as const, radiusKm: 10 }; if (editingJob) { await updateJobMutation.mutateAsync({ ...payload, jobId: editingJob.id }); setEditingJob(null); flash("Job details updated. Matching fundis will see the revised brief."); } else { const result = await createJobMutation.mutateAsync(payload); flash(`Job posted. ${result.matches} matching fundi${result.matches === 1 ? "" : "s"} notified.`); } setJobForm({ trade: "Masonry", title: "", description: "", location: me?.location ?? "", budget: "", startDate: "", contact: "Call me" }); setShowJobModal(false); } catch (error) { mutationError(error); } };
  const submitRating = (score: number, comment: string) => { if (!showRatingModal) return; rateMutation.mutate({ jobId: showRatingModal.id, score, comment: comment || undefined }, { onSuccess: () => { setShowRatingModal(null); flash("Thanks — your feedback is now linked to the completed job."); }, onError: mutationError }); };
  const toggleAvailability = () => { const next = !available; availabilityMutation.mutate({ available: next }, { onSuccess: () => { setAvailable(next); flash(next ? "You are now visible for nearby matches." : "Availability paused. You will not receive new match prompts."); }, onError: mutationError }); };
  const saveProfile = (event: FormEvent) => { event.preventDefault(); profileUpdateMutation.mutate({ ...profileForm, trades: profileForm.trades as ("Masonry" | "Plumbing" | "Electrical" | "Painting" | "Carpentry" | "Welding")[] }, { onSuccess: () => { setShowProfileModal(false); flash("Your fundi profile is now saved."); }, onError: mutationError }); };
  const editJob = (job: Job) => { setEditingJob(job); setJobForm({ trade: job.trade, title: job.title, description: job.description, location: job.location, budget: moneyAmount(job.budget), startDate: job.startDate, contact: "Either" }); setShowJobModal(true); };

  return <div className="app-shell"><div className="kenya-stripe" aria-hidden="true"><span /><span /><span /><span /></div><aside className={`sidebar ${mobileNavOpen ? "sidebar-open" : ""}`}><div className="sidebar-head"><BrandMark /><button className="icon-button sidebar-close" onClick={() => setMobileNavOpen(false)} aria-label="Close menu"><X size={18} /></button></div><div className="pilot-chip"><span className="live-dot" /> MJENGOLINK PILOT <span className="pilot-count">v0.1</span></div><nav className="side-nav" aria-label="Main navigation"><FieldLabel>Workspace</FieldLabel>{currentNav.map(({ key, label, icon: Icon }) => <button key={key} className={`nav-item ${activeNav === key ? "nav-active" : ""}`} onClick={() => { setActiveNav(key); setMobileNavOpen(false); }}><Icon size={17} strokeWidth={activeNav === key ? 2.5 : 1.8} /><span>{label}</span>{activeNav === key && <ChevronRight size={15} className="nav-arrow" />}</button>)}</nav><div className="sidebar-bottom"><div className="location-stamp"><MapPinned size={16} /><div><small>Your location</small><strong>{me.location ?? "Not set"}</strong></div></div><button className="profile-mini account-button" onClick={() => setShowAccountPanel(true)}><Avatar initials={initialsFromName(displayName)} tone="ink" src={me.avatarUrl} /><div><strong>{displayName}</strong><small>{role === "admin" ? "Platform admin" : `${role[0].toUpperCase()}${role.slice(1)} account`}</small></div><MoreHorizontal size={17} /></button></div></aside>{mobileNavOpen && <button className="mobile-scrim" onClick={() => setMobileNavOpen(false)} aria-label="Close navigation" />}<main className="main-content"><header className="topbar"><button className="icon-button mobile-menu" onClick={() => setMobileNavOpen(true)} aria-label="Open menu"><Menu size={21} /></button><div className="crumb"><span>MjengoLink</span><ChevronRight size={14} /><strong>{role === "client" ? "Client desk" : role === "fundi" ? "Fundi desk" : "Admin desk"}</strong></div><div className="topbar-actions"><span className="server-role-badge"><span className="live-dot" />{role === "admin" ? "Admin" : role === "client" ? "Client" : "Fundi"}</span><button className="icon-button notification" onClick={() => setShowNotifications(true)} aria-label={`Open notifications${unreadCount ? `, ${unreadCount} unread` : ""}`}><Bell size={18} />{unreadCount > 0 && <span />}</button></div></header><div className="page-wrap"><div className="page-heading"><div><div className="eyebrow"><span className="eyebrow-line" />{role === "client" ? `CLIENT DESK / ${todayLabel}` : role === "fundi" ? "FUNDI DESK / LIVE OPPORTUNITIES" : "ADMIN / PILOT OVERSIGHT"}</div><h1>{pageTitle}</h1><p>{role === "client" ? "Find the right hands for the job, without the run-around." : role === "fundi" ? "Kazi karibu na wewe. Pick the jobs that fit your hands." : "Keep the pilot useful, fair and safe for every side."}</p></div>{role === "client" && <button className="primary-button" onClick={() => setShowJobModal(true)}><Plus size={17} />Post a job</button>}{role === "fundi" && <button className={`availability-button ${available ? "is-available" : ""}`} onClick={toggleAvailability}><span className="availability-dot" />{available ? "Available for kazi" : "Availability paused"}</button>}</div>{role === "client" && <ClientView activeNav={activeNav} jobs={clientJobs} activeJobs={activeJobs} completedJobs={completedJobs} fundis={filteredFundis} search={fundiSearch} setSearch={setFundiSearch} onSelectFundi={setSelectedFundi} onAdvance={advanceStatus} onCancel={cancelJob} onRate={setShowRatingModal} onEdit={editJob} onReviewInterest={setReviewJob} metrics={store.metrics} />}{role === "fundi" && <FundiView activeNav={activeNav} jobs={fundiJobs} allJobs={store.jobs} fundis={currentFundi ? [currentFundi] : []} search={jobSearch} setSearch={setJobSearch} tradeFilter={tradeFilter} setTradeFilter={setTradeFilter} onRespond={respondToJob} available={available} onReset={() => { setJobSearch(""); setTradeFilter("All trades"); }} onEditProfile={() => setShowProfileModal(true)} viewer={{ name: me.name, email: me.email, id: me.id, avatarUrl: me.avatarUrl }} />}{role === "admin" && <AdminView activeNav={activeNav} store={store} onResolve={resolveReport} />}</div></main>{selectedFundi && <FundiDrawer fundi={selectedFundi} onClose={() => setSelectedFundi(null)} />}{showJobModal && <JobModal form={jobForm} setForm={setJobForm} onClose={() => { setShowJobModal(false); setEditingJob(null); }} onSubmit={submitJob} editing={Boolean(editingJob)} />}{showRatingModal && <RatingModal job={showRatingModal} onClose={() => setShowRatingModal(null)} onSubmit={submitRating} />}{showProfileModal && <FundiProfileModal form={profileForm} setForm={setProfileForm} onClose={() => setShowProfileModal(false)} onSubmit={saveProfile} pending={profileUpdateMutation.isPending} />}{reviewJob && <ResponsesModal job={reviewJob} responders={responsesQuery.data ?? []} loading={responsesQuery.isLoading} pendingDecision={decideResponseMutation.isPending} pendingChat={openChatMutation.isPending} onDecide={decideResponse} onOpenChat={(workerId) => openChatMutation.mutate({ jobId: reviewJob.id, workerId })} onClose={() => setReviewJob(null)} />}{showNotifications && <NotificationModal notifications={notificationsQuery.data ?? []} loading={notificationsQuery.isLoading} unreadCount={unreadCount} pending={markAllNotificationsReadMutation.isPending} onSelect={openNotification} onMarkAll={() => markAllNotificationsReadMutation.mutate()} onOpenInbox={() => { setShowNotifications(false); setShowInbox(true); }} onClose={() => setShowNotifications(false)} />}{showInbox && !selectedConversation && <InboxModal conversations={inboxQuery.data ?? []} loading={inboxQuery.isLoading} onSelect={openConversation} onClose={() => setShowInbox(false)} />}{showInbox && selectedConversation && <ChatModal conversation={selectedConversation} messages={messagesQuery.data ?? []} draft={chatDraft} setDraft={setChatDraft} pending={sendMessageMutation.isPending} onSend={sendChat} onBack={() => { setSelectedConversationId(null); void utils.inbox.list.invalidate(); }} onClose={() => { setShowInbox(false); setSelectedConversationId(null); }} />}{showAccountPanel && <AccountPanel role={role} name={displayName} email={me.email ?? ""} location={me.location ?? ""} avatarUrl={me.avatarUrl} photoPending={photoMutation.isPending || removePhotoMutation.isPending} onPhoto={selectPhoto} onRemovePhoto={() => removePhotoMutation.mutate()} onClose={() => setShowAccountPanel(false)} onLogout={() => logoutMutation.mutate()} />}{notice && <div className="toast"><CheckCircle2 size={18} /><span>{notice}</span><button onClick={() => setNotice("")} aria-label="Dismiss notification"><X size={15} /></button></div>}</div>;
}

function AuthFrame({ children }: { children: React.ReactNode }) { return <div className="auth-shell"><div className="kenya-stripe" aria-hidden="true"><span /><span /><span /><span /></div>{children}</div>; }

function LoginForm() {
  const utils = trpc.useUtils();
  const loginMutation = trpc.auth.login.useMutation();
  const registerMutation = trpc.auth.register.useMutation();
  const resendConfirmationMutation = trpc.auth.resendConfirmation.useMutation();
  const requestPasswordResetMutation = trpc.auth.requestPasswordReset.useMutation();
  const updatePasswordMutation = trpc.auth.updatePassword.useMutation();
  const [mode, setMode] = useState<"login" | "register" | "forgot" | "reset">("login");
  const [name, setName] = useState("");
  const [location, setLocation] = useState("");
  const [registerRole, setRegisterRole] = useState<"client" | "fundi">("client");
  const [registerTrade, setRegisterTrade] = useState("Masonry");
  const [registerPhone, setRegisterPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [recoveryTokens, setRecoveryTokens] = useState<{ accessToken: string; refreshToken: string } | null>(null);
  const authToastId = "auth-notice";
  const showAuthMessage = (text: string, action?: { label: string; onClick: () => void }) => toast.success(text, {
    id: authToastId,
    duration: action ? 10_000 : 6_000,
    ...(action ? { action } : {}),
  });
  const showAuthError = (text: string, action?: { label: string; onClick: () => void }) => toast.error(text, {
    id: authToastId,
    duration: action ? 10_000 : 6_000,
    ...(action ? { action } : {}),
  });
  const resendConfirmation = async (address: string) => {
    if (!address) {
      showAuthError("Enter your email address before resending the confirmation email.");
      return;
    }
    toast.dismiss(authToastId);
    try {
      await resendConfirmationMutation.mutateAsync({ email: address });
      showAuthMessage("If that account still needs confirmation, a new email has been sent.");
    } catch (cause) {
      showAuthError(cause instanceof Error ? cause.message : "Unable to send a confirmation email.");
    }
  };
  const isPending = loginMutation.isPending || registerMutation.isPending || resendConfirmationMutation.isPending || requestPasswordResetMutation.isPending || updatePasswordMutation.isPending;

  useEffect(() => {
    const url = new URL(window.location.href);
    const hash = new URLSearchParams(url.hash.replace(/^#/, ""));
    const type = hash.get("type");
    const accessToken = hash.get("access_token");
    const refreshToken = hash.get("refresh_token");
    const emailError = hash.get("error_description") ?? url.searchParams.get("error_description");

    if (emailError) {
      showAuthError("That email link is invalid or expired. Request a new one and try again.");
    } else if (type === "recovery" || url.searchParams.get("auth") === "password-reset") {
      if (accessToken && refreshToken) {
        setRecoveryTokens({ accessToken, refreshToken });
        setMode("reset");
      } else {
        showAuthError("That password reset link is invalid or expired. Request a new one and try again.");
      }
    } else if (type === "signup" || type === "magiclink" || url.searchParams.get("auth") === "email-confirmed") {
      setMode("login");
      showAuthMessage("Your email is confirmed. You can now sign in.");
    }

    if (url.hash || url.searchParams.has("auth") || url.searchParams.has("error_description")) {
      window.history.replaceState(null, "", url.pathname);
    }
  }, []);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    toast.dismiss(authToastId);
    try {
      if (mode === "register") {
        if (password !== passwordConfirmation) {
          showAuthError("The passwords do not match.");
          return;
        }
        const result = await registerMutation.mutateAsync({
          name,
          email,
          password,
          location,
          role: registerRole,
          ...(registerRole === "fundi" ? { phone: registerPhone || undefined, trades: [registerTrade as "Masonry" | "Plumbing" | "Electrical" | "Painting" | "Carpentry" | "Welding"] } : {}),
        });
        if (result.confirmationRequired) {
          setMode("login");
          setPassword("");
          setPasswordConfirmation("");
          showAuthMessage("Check your inbox and spam folder for a confirmation email. Confirm your email before signing in.", {
            label: "Resend confirmation email",
            onClick: () => void resendConfirmation(email),
          });
          return;
        }
      } else if (mode === "forgot") {
        await requestPasswordResetMutation.mutateAsync({ email });
        setMode("login");
        showAuthMessage("If an account exists for that email, we sent a password reset link.");
        return;
      } else if (mode === "reset") {
        if (password !== passwordConfirmation) {
          showAuthError("The passwords do not match.");
          return;
        }
        if (!recoveryTokens) {
          showAuthError("That password reset link is invalid or expired. Request a new one and try again.");
          return;
        }
        await updatePasswordMutation.mutateAsync({ ...recoveryTokens, password });
        setRecoveryTokens(null);
        setMode("login");
        setPassword("");
        setPasswordConfirmation("");
        showAuthMessage("Your password has been updated. Sign in with your new password.");
        return;
      } else {
        await loginMutation.mutateAsync({ email, password });
      }
      await utils.auth.me.invalidate();
    } catch (cause) {
      const text = cause instanceof Error ? cause.message : "Unable to sign in. Please try again.";
      const needsConfirmation = cause instanceof Error && (text.includes("Confirm your email address") || text.includes("already registered"));
      if (needsConfirmation) setMode("login");
      showAuthError(text, needsConfirmation ? { label: "Resend confirmation email", onClick: () => void resendConfirmation(email) } : undefined);
    }
  };

  const title = mode === "login"
    ? "Build with trusted hands nearby."
    : mode === "register"
      ? "Create your MjengoLink account."
      : mode === "forgot"
        ? "Reset your password."
        : "Choose a new password.";
  const description = mode === "login"
    ? "Sign in to manage jobs, discover fundis and keep your work history in one place."
    : mode === "register"
      ? "Join MjengoLink to post jobs or find construction work near you."
      : mode === "forgot"
        ? "Enter your account email and we’ll send a secure reset link if it matches an account."
        : "Use at least 8 characters for your new password.";

  return (
    <AuthFrame>
      <div className="auth-card">
        <BrandMark />
        <div className="eyebrow"><span className="eyebrow-line" />WELCOME TO MJENGOLINK</div>
        <h1>{title}</h1>
        <p>{description}</p>
        <form className="auth-form" onSubmit={submit}>
          {mode === "register" && (
            <label>
              Full name
              <input autoComplete="name" maxLength={120} minLength={2} onChange={event => setName(event.target.value)} required value={name} />
            </label>
          )}
          {mode === "register" && (
            <label>
              Your location
              <input autoComplete="address-level2" maxLength={255} minLength={2} onChange={event => setLocation(event.target.value)} required value={location} placeholder="e.g. Kapsoya, Eldoret" />
              <small>Tell us where you are so MjengoLink can show relevant work and fundis.</small>
            </label>
          )}
          {mode === "register" && (
            <label>
              How will you use MjengoLink?
              <span className="role-switch">
                <button className={registerRole === "client" ? "role-active" : ""} onClick={() => setRegisterRole("client")} type="button">I need work done</button>
                <button className={registerRole === "fundi" ? "role-active" : ""} onClick={() => setRegisterRole("fundi")} type="button">I offer services</button>
              </span>
            </label>
          )}
          {mode === "register" && registerRole === "fundi" && (
            <>
              <label>
                Main trade
                <select className="input" onChange={event => setRegisterTrade(event.target.value)} value={registerTrade}>
                  {trades.slice(1).map(trade => <option key={trade}>{trade}</option>)}
                </select>
              </label>
              <label>
                Phone number <span className="auth-optional">(optional)</span>
                <input autoComplete="tel" maxLength={32} onChange={event => setRegisterPhone(event.target.value)} placeholder="07xx xxx xxx" value={registerPhone} />
              </label>
            </>
          )}
          {mode !== "reset" && (
            <label>
              Email address
              <input autoComplete="email" onChange={event => setEmail(event.target.value)} required type="email" value={email} />
            </label>
          )}
          {(mode === "login" || mode === "register" || mode === "reset") && (
            <label>
              {mode === "reset" ? "New password" : "Password"}
              <span className="auth-password-field">
                <input autoComplete={mode === "login" ? "current-password" : "new-password"} maxLength={128} minLength={mode === "login" ? 1 : 8} onChange={event => setPassword(event.target.value)} required type={passwordVisible ? "text" : "password"} value={password} />
                <button aria-label={passwordVisible ? "Hide password" : "Show password"} aria-pressed={passwordVisible} className="auth-password-toggle" onClick={() => setPasswordVisible(value => !value)} type="button">
                  {passwordVisible ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </span>
              {(mode === "register" || mode === "reset") && <small>Use at least 8 characters.</small>}
            </label>
          )}
          {(mode === "register" || mode === "reset") && (
            <label>
              Confirm password
              <span className="auth-password-field">
                <input autoComplete="new-password" maxLength={128} minLength={8} onChange={event => setPasswordConfirmation(event.target.value)} required type={passwordVisible ? "text" : "password"} value={passwordConfirmation} />
                <button aria-label={passwordVisible ? "Hide password" : "Show password"} aria-pressed={passwordVisible} className="auth-password-toggle" onClick={() => setPasswordVisible(value => !value)} type="button">
                  {passwordVisible ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </span>
            </label>
          )}
          {mode === "login" && <button className="auth-inline-link" onClick={() => setMode("forgot")} type="button">Forgot password?</button>}
          <button className="primary-button auth-cta" disabled={isPending} type="submit">
            {isPending ? "Please wait…" : mode === "login" ? "Sign in" : mode === "register" ? "Create account" : mode === "forgot" ? "Send reset link" : "Update password"}
          </button>
        </form>
        {mode === "login" || mode === "register" ? (
          <div className="auth-switch">
            {mode === "login" ? "New to MjengoLink?" : "Already have an account?"}
            <button type="button" onClick={() => setMode(mode === "login" ? "register" : "login")}>
              {mode === "login" ? "Create an account" : "Sign in"}
            </button>
          </div>
        ) : (
          <div className="auth-switch">
            <button type="button" onClick={() => setMode("login")}>
              Back to sign in
            </button>
          </div>
        )}
      </div>
    </AuthFrame>
  );
}

function ClientView({ activeNav, jobs, activeJobs, completedJobs, fundis, search, setSearch, onSelectFundi, onAdvance, onCancel, onRate, onEdit, onReviewInterest, metrics }: { activeNav: NavKey; jobs: Job[]; activeJobs: Job[]; completedJobs: Job[]; fundis: Fundi[]; search: string; setSearch: (value: string) => void; onSelectFundi: (fundi: Fundi) => void; onAdvance: (jobId: string) => void; onCancel: (jobId: string) => void; onRate: (job: Job) => void; onEdit: (job: Job) => void; onReviewInterest: (job: Job) => void; metrics: Store["metrics"] }) {
  if (activeNav === "fundis") return <FundiDirectory fundis={fundis} search={search} setSearch={setSearch} onSelect={onSelectFundi} />;
  if (activeNav === "history") return <JobHistory jobs={completedJobs} onRate={onRate} />;
  if (activeNav === "jobs") return <JobsTable jobs={jobs} onAdvance={onAdvance} onCancel={onCancel} onRate={onRate} onEdit={onEdit} onReviewInterest={onReviewInterest} />;
  return (
    <>
      <section className="stat-row">
        <Metric label="Active jobs" value={String(activeJobs.length).padStart(2, "0")} detail={`${activeJobs.filter((job) => job.interested > 0).length} with interest`} tone="green" icon={<BriefcaseBusiness size={17} />} />
        <Metric label="Potential matches" value={String(activeJobs.reduce((total, job) => total + job.matched, 0)).padStart(2, "0")} detail={`Across ${activeJobs.length} open jobs`} tone="terracotta" icon={<Users size={17} />} />
        <Metric label="In progress" value={String(activeJobs.filter((job) => job.status === "In progress").length).padStart(2, "0")} detail="Recorded on your jobs" tone="mustard" icon={<Activity size={17} />} />
        <Metric label="Completed" value={String(completedJobs.length).padStart(2, "0")} detail={`${metrics.completedJobs} platform-wide`} tone="ink" icon={<Clock3 size={17} />} />
      </section>
      <div className="content-grid">
        <section className="panel jobs-panel">
          <PanelHeading eyebrow="YOUR WORKBENCH" title="Current jobs" action={<button className="text-button" onClick={() => document.querySelector<HTMLButtonElement>(".nav-item:nth-of-type(3)")?.click()}>View all <ArrowUpRight size={14} /></button>} />
          <div className="job-list">{activeJobs.slice(0, 3).map((job) => <JobRow key={job.id} job={job} onAdvance={onAdvance} onRate={onRate} />)}</div>
          {activeJobs.length === 0 && <EmptyState title="No active jobs yet" description="Post your first job and start finding the right hands nearby." />}
        </section>
        <aside className="panel nearby-panel">
          <PanelHeading eyebrow="NEARBY / MATCHED" title="Fundis in your orbit" action={<button className="icon-button small" onClick={() => setSearch("")} aria-label="Refresh fundi list"><RefreshCcw size={15} /></button>} />
          <div className="nearby-list">{fundis.slice(0, 3).map((fundi) => <FundiMini key={fundi.id} fundi={fundi} onClick={() => onSelectFundi(fundi)} />)}</div>
          <button className="panel-link" onClick={() => document.querySelector<HTMLButtonElement>(".nav-item:nth-of-type(4)")?.click()}>Browse all nearby fundis <ChevronRight size={15} /></button>
        </aside>
      </div>
      <section className="bottom-grid">
        <div className="notice-card"><div className="notice-icon"><ShieldCheck size={20} /></div><div><FieldLabel>TRUST NOTE</FieldLabel><h3>Ratings show past experience, not a certificate.</h3><p>Always confirm scope, price and site details directly before work begins.</p></div><LockKeyhole size={16} className="notice-lock" /></div>
        <div className="pulse-card"><div className="pulse-head"><div><FieldLabel>PILOT PULSE</FieldLabel><h3>{metrics.openJobs} open jobs across the platform.</h3></div><TrendingUp size={20} /></div><div className="pulse-summary"><span><strong>{metrics.jobsPosted}</strong> jobs posted</span><span><strong>{metrics.openJobs}</strong> open now</span><span><strong>{metrics.fundiUsers}</strong> fundis</span></div><small>{metrics.registeredUsers} registered accounts · live database records</small></div>
      </section>
    </>
  );
}

function Metric({ label, value, detail, tone, icon }: { label: string; value: string; detail: string; tone: string; icon: React.ReactNode }) {
  return <div className={`metric-card metric-${tone}`}><div className="metric-top"><span>{label}</span><span className="metric-icon">{icon}</span></div><strong>{value}</strong><small>{detail}</small></div>;
}

function PanelHeading({ eyebrow, title, action }: { eyebrow: string; title: string; action?: React.ReactNode }) {
  return <div className="panel-heading"><div><FieldLabel>{eyebrow}</FieldLabel><h2>{title}</h2></div>{action}</div>;
}

function JobRow({ job, onAdvance, onRate, onReviewInterest }: { job: Job; onAdvance?: (id: string) => void; onRate?: (job: Job) => void; onReviewInterest?: (job: Job) => void }) {
  const isComplete = job.status === "Completed";
  return <div className="job-row"><div className="job-kind"><div className={`trade-icon trade-${job.trade.toLowerCase()}`}><TradeIcon trade={job.trade} /></div><div><div className="job-row-title"><strong>{job.title}</strong><span className="job-id">{job.id}</span></div><div className="job-meta"><span><MapPin size={13} />{job.location}</span><span><CalendarDays size={13} />Start {job.startDate}</span><span>{job.budget}</span></div></div></div><div className="job-row-right"><StatusPill status={job.status} /><span className="interest-count">{job.interested} interested</span><div className="job-actions">{onReviewInterest && job.interested > 0 && <button className="outline-button compact" onClick={() => onReviewInterest(job)}><Users size={14} />Review interest</button>}{isComplete ? onRate && <button className="outline-button compact" onClick={() => onRate(job)}><Star size={14} />Rate fundi</button> : onAdvance && <button className="outline-button compact" onClick={() => onAdvance(job.id)}>{job.status === "In progress" ? "Mark complete" : "Move to next step"}<ChevronRight size={14} /></button>}</div></div></div>;
}

function FundiMini({ fundi, onClick }: { fundi: Fundi; onClick: () => void }) {
  return <button className="fundi-mini" onClick={onClick}><Avatar initials={fundi.initials} tone={fundi.tone} src={fundi.avatarUrl} /><div className="fundi-mini-copy"><strong>{fundi.name}</strong><span>{fundi.trade} · {fundi.distance}</span><span className="rating"><Star size={12} fill="currentColor" /> {fundi.rating} <em>({fundi.ratings})</em></span></div><ChevronRight size={16} /></button>;
}

function TradeIcon({ trade }: { trade: string }) {
  if (trade === "Plumbing") return <Wrench size={17} />;
  if (trade === "Painting") return <Paintbrush size={17} />;
  if (trade === "Electrical") return <Zap size={17} />;
  return <Hammer size={17} />;
}

function JobsTable({ jobs, onAdvance, onCancel, onRate, onEdit, onReviewInterest }: { jobs: Job[]; onAdvance: (id: string) => void; onCancel: (jobId: string) => void; onRate: (job: Job) => void; onEdit: (job: Job) => void; onReviewInterest: (job: Job) => void }) {
  return <section className="panel full-panel"><PanelHeading eyebrow="CLIENT DESK / ALL POSTS" title="My jobs" action={<span className="record-count">{jobs.length} records</span>} /><div className="table-wrap"><table><thead><tr><th>Job</th><th>Location</th><th>Budget</th><th>Status</th><th>Interest</th><th /></tr></thead><tbody>{jobs.map((job) => <tr key={job.id}><td><strong>{job.title}</strong><small>{job.id} · {job.trade}</small></td><td>{job.location}</td><td>{job.budget}</td><td><StatusPill status={job.status} /></td><td>{job.interested} fundis</td><td>{job.status === "Completed" ? <button className="text-button" onClick={() => onRate(job)}>Rate <Star size={13} /></button> : job.status === "Cancelled" ? <span className="job-id">Closed</span> : <span className="job-table-actions">{job.interested > 0 && <button className="text-button" onClick={() => onReviewInterest(job)}>Review <Users size={13} /></button>}{["Posted", "Interested"].includes(job.status) && <button className="text-button" onClick={() => onEdit(job)}>Edit</button>}<button className="text-button" onClick={() => onAdvance(job.id)}>Advance <ChevronRight size={13} /></button><button className="text-button danger-text" onClick={() => onCancel(job.id)}>Cancel</button></span>}</td></tr>)}</tbody></table></div></section>;
}

function JobHistory({ jobs, onRate }: { jobs: Job[]; onRate?: (job: Job) => void }) {
  return <section className="panel full-panel"><PanelHeading eyebrow="WORK RECORD" title="Work history" action={<span className="record-count">{jobs.length} completed jobs</span>} />{jobs.length ? <div className="history-grid">{jobs.map((job) => <div className="history-card" key={job.id}><div className="history-card-head"><span className="job-id">{job.id}</span><StatusPill status="Completed" /></div><h3>{job.title}</h3><p>{job.location} · {job.startDate}</p><div className="history-card-foot"><strong>{job.budget}</strong>{onRate && <button className="outline-button compact" onClick={() => onRate(job)}><Star size={14} /> Add feedback</button>}</div></div>)}</div> : <EmptyState title="Your completed jobs will appear here" description="Keep a record of work done and leave a job-linked rating when a job is complete." />}</section>;
}

function FundiDirectory({ fundis, search, setSearch, onSelect }: { fundis: Fundi[]; search: string; setSearch: (value: string) => void; onSelect: (fundi: Fundi) => void }) {
  return <><div className="directory-toolbar"><div className="search-field"><Search size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name, trade or estate" /></div><button className="filter-button"><SlidersHorizontal size={15} /> Filters</button><span className="result-label">{fundis.length} fundis nearby</span></div><div className="fundi-directory">{fundis.map((fundi) => <button className="fundi-card" key={fundi.id} onClick={() => onSelect(fundi)}><div className="fundi-card-top"><Avatar initials={fundi.initials} tone={fundi.tone} size="large" src={fundi.avatarUrl} /><span className={`availability-label ${fundi.available ? "available" : "away"}`}><i />{fundi.available ? "Available" : "Away"}</span></div><div className="fundi-card-body"><div className="fundi-name-line"><h3>{fundi.name}</h3><ArrowUpRight size={17} /></div><div className="fundi-trade">{fundi.trades.join(" / ")}</div><p>{fundi.note}</p><div className="fundi-stats"><span><MapPin size={13} />{fundi.distance}</span><span><Star size={13} fill="currentColor" />{fundi.rating} <em>({fundi.ratings})</em></span><span><Clock3 size={13} />{fundi.response.replace("Usually replies in ", "")}</span></div></div></button>)}</div>{fundis.length === 0 && <EmptyState title="No fundis match that search" description="Try an estate, trade or name. You can also post the job to reach the wider pilot network." />}</>;
}

function FundiView({ activeNav, jobs, allJobs, fundis, search, setSearch, tradeFilter, setTradeFilter, onRespond, available, onReset, onEditProfile, viewer }: { activeNav: NavKey; jobs: Job[]; allJobs: Job[]; fundis: Fundi[]; search: string; setSearch: (value: string) => void; tradeFilter: string; setTradeFilter: (value: string) => void; onRespond: (job: Job) => void; available: boolean; onReset: () => void; onEditProfile: () => void; viewer: { id?: number; name?: string | null; email?: string | null; avatarUrl?: string | null } }) {
  const respondedJobs = allJobs.filter((job) => job.responders.includes("current-fundi"));
  const completedJobs = allJobs.filter((job) => job.status === "Completed" && job.responders.includes("current-fundi"));
  const ownProfile = fundis[0] ?? null;
  if (activeNav === "profile") return ownProfile ? <FundiProfile fundi={ownProfile} available={available} onEdit={onEditProfile} /> : <section className="panel full-panel"><PanelHeading eyebrow="FUNDI PROFILE" title="Your profile" /><EmptyState title="Complete your fundi profile" description="Add your trade, service area and experience so clients can see who they are hiring." /><div className="empty-action"><button className="primary-button" onClick={onEditProfile}>Set up profile</button></div></section>;
  if (activeNav === "history") return <JobHistory jobs={completedJobs} />;
  if (activeNav === "responses") return <section className="panel full-panel"><PanelHeading eyebrow="YOUR INTEREST" title="My responses" action={<span className="record-count">{respondedJobs.length} active responses</span>} />{respondedJobs.length ? respondedJobs.map((job) => <JobRow key={job.id} job={job} />) : <EmptyState title="No responses yet" description="When you express interest in a job, it will appear here for easy follow-up." />}</section>;
  return <><section className="fundi-hero"><div><div className="eyebrow"><span className="eyebrow-line" />MATCHING BY TRADE + PLACE + TIME</div><h2>Choose work that fits your hands.</h2><p>Browse nearby construction jobs, check the brief and show interest when the details work for you.</p></div><div className="fundi-hero-note"><MapPin size={17} /><div><strong>Searching around {ownProfile?.location ?? "your area"}</strong><span>Approximate distance only. Confirm the site before accepting.</span></div></div></section><div className="directory-toolbar board-toolbar"><div className="search-field"><Search size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search jobs or estates" /></div><select value={tradeFilter} onChange={(event) => setTradeFilter(event.target.value)} className="filter-select">{trades.map((trade) => <option key={trade}>{trade}</option>)}</select><button className="filter-button" onClick={onReset}><RefreshCcw size={15} /> Reset</button><span className="result-label">{jobs.length} jobs found</span></div><div className="board-layout"><div className="job-board">{jobs.map((job) => {
    const isOwnPosting = job.clientId !== undefined && viewer.id !== undefined && job.clientId === viewer.id;
    const isClosed = ["Completed", "Cancelled"].includes(job.status);
    return <OpportunityCard key={job.id} job={job} onRespond={onRespond} responded={job.responders.includes("current-fundi")} canRespond={!isOwnPosting && !isClosed} />;
  })}{jobs.length === 0 && <EmptyState title="No matching kazi right now" description="Try another trade or clear your filters. New opportunities will show here as they are posted." />}</div>{ownProfile ? <FundiSideProfile fundi={ownProfile} available={available} onEdit={onEditProfile} /> : <aside className="panel fundi-side-profile"><EmptyState title="Set up your fundi profile" description="Your trade and service area help clients find you for the right jobs." /><div className="empty-action"><button className="primary-button" onClick={onEditProfile}>Set up profile</button></div></aside>}</div></>;
}

function OpportunityCard({ job, onRespond, responded, canRespond }: { job: Job; onRespond: (job: Job) => void; responded: boolean; canRespond: boolean }) {
  return <article className="opportunity-card"><div className="opportunity-top"><div className={`trade-icon trade-${job.trade.toLowerCase()}`}><TradeIcon trade={job.trade} /></div><div><div className="job-row-title"><strong>{job.title}</strong><span className="job-id">{job.id}</span></div><div className="job-meta"><span><MapPin size={13} />{job.location} · {job.distance}</span><span><CalendarDays size={13} />Start {job.startDate}</span></div></div><button className="icon-button small" aria-label="Save job"><MoreHorizontal size={16} /></button></div><p className="opportunity-description">{job.description}</p><div className="opportunity-bottom"><div><FieldLabel>PROPOSED PAY</FieldLabel><strong className="opportunity-pay">{job.budget}</strong></div><div><FieldLabel>INTERESTED</FieldLabel><strong>{job.interested} fundis</strong></div>{canRespond ? <button className={responded ? "responded-button" : "primary-button"} onClick={() => !responded && onRespond(job)}>{responded ? <><Check size={16} />Interest sent</> : <><Send size={15} />Show interest</>}</button> : <span className="job-id">Your posting</span>}</div></article>;
}

function FundiProfile({ fundi, available, onEdit }: { fundi: Fundi; available: boolean; onEdit: () => void }) {
  return <div className="profile-layout"><section className="panel profile-main"><div className="profile-cover" /><div className="profile-main-body"><div className="profile-avatar-wrap"><Avatar initials={fundi.initials} tone={fundi.tone} size="large" src={fundi.avatarUrl} /><span className={`availability-label ${available ? "available" : "away"}`}><i />{available ? "Available now" : "Away"}</span></div><div className="profile-intro"><div className="eyebrow"><span className="eyebrow-line" />FUNDI PROFILE / PUBLIC VIEW</div><h2>{fundi.name}</h2><p>{fundi.trades.join(" · ")} · {fundi.location}</p><div className="profile-rating"><Star size={16} fill="currentColor" /> <strong>{fundi.rating || "—"}</strong> <span>{fundi.ratings} job-linked ratings</span></div></div><div className="profile-actions"><button className="outline-button" onClick={onEdit}><SlidersHorizontal size={15} />Edit profile</button></div></div><div className="profile-details"><div><FieldLabel>ABOUT THE WORK</FieldLabel><p>{fundi.note} Confirm the site, scope and price before starting.</p></div><div><FieldLabel>RESPONSE HABIT</FieldLabel><p>{fundi.response}. Profiles show reported history, not a professional certificate.</p></div></div></section><aside className="profile-aside"><div className="panel trust-card"><div className="trust-seal"><ShieldCheck size={23} /></div><FieldLabel>TRUST, EXPLAINED</FieldLabel><h3>Clear records beat big promises.</h3><p>Ratings on MjengoLink are linked to completed jobs. They help you compare experiences, but do not guarantee workmanship.</p><div className="trust-list"><span><CheckCircle2 size={15} />Job-linked ratings</span><span><CheckCircle2 size={15} />Approximate location</span><span><CheckCircle2 size={15} />No identity claim</span></div></div></aside></div>;
}

function FundiSideProfile({ fundi, available, onEdit }: { fundi: Fundi; available: boolean; onEdit: () => void }) {
  const strengthItems = [fundi.trades.length > 0, Boolean(fundi.location), Boolean(fundi.note), Boolean(fundi.experience && fundi.experience !== "Experience not yet added")];
  const strength = Math.round((strengthItems.filter(Boolean).length / strengthItems.length) * 100);
  return <aside className="panel fundi-side-profile"><div className="side-profile-head"><Avatar initials={fundi.initials} tone={fundi.tone} src={fundi.avatarUrl} /><div><strong>{fundi.name}</strong><span>{fundi.trades.join(" / ")}</span></div><span className={`mini-availability ${available ? "available" : "away"}`}><i /></span></div><div className="side-profile-rating"><Star size={13} fill="currentColor" /> {fundi.rating || "—"} <span>({fundi.ratings})</span></div><div className="side-profile-stats"><div><strong>{fundi.experience}</strong><span>experience</span></div><div><strong>{fundi.location}</strong><span>service area</span></div><div><strong>{fundi.response.replace("Usually replies in ", "")}</strong><span>response</span></div></div><div className="profile-completeness"><div><span>Profile strength</span><strong>{strength}%</strong></div><div className="progress-track"><span style={{ width: `${strength}%` }} /></div><small>Add your trade, area and work summary to improve trust.</small></div><button className="panel-link" onClick={onEdit}>Edit my profile <ArrowUpRight size={15} /></button></aside>;
}

function AdminView({ activeNav, store, onResolve }: { activeNav: NavKey; store: Store; onResolve: (id: string) => void }) {
  if (activeNav === "reports") return <section className="panel full-panel"><PanelHeading eyebrow="MODERATION QUEUE" title="Reports to review" action={<span className="record-count">{store.reports.filter((report) => report.status === "Review").length} open</span>} /><div className="report-list">{store.reports.map((report) => <div className="report-row" key={report.id}><div className="report-icon"><Flag size={16} /></div><div className="report-copy"><div><strong>{report.subject}</strong><span className="job-id">{report.id}</span></div><p>{report.reason} · {report.date}</p></div><span className={`report-status ${report.status.toLowerCase()}`}>{report.status}</span>{report.status === "Review" && <button className="outline-button compact" onClick={() => onResolve(report.id)}><Check size={14} />Resolve</button>}<button className="icon-button small" aria-label="View report"><Eye size={15} /></button></div>)}</div></section>;
  if (activeNav === "jobs") return <section className="panel full-panel"><PanelHeading eyebrow="PILOT RECORDS" title="Accounts & jobs" action={<span className="record-count">{store.accounts.length} accounts</span>} /><div className="admin-record-grid"><div><FieldLabel>REGISTERED ACCOUNTS</FieldLabel>{store.accounts.slice(0, 8).map((account) => <div className="admin-person" key={account.id}><Avatar initials={initialsFromName(account.name)} tone={account.role === "Fundi" ? "terracotta" : account.role === "Admin" ? "ink" : "green"} /><div><strong>{account.name}</strong><span>{account.role} · {account.email || "Email not supplied"}</span></div><span className="record-flag">{account.status}</span></div>)}{store.accounts.length === 0 && <EmptyState title="No accounts yet" description="Authenticated pilot members will appear here." />}</div><div><FieldLabel>JOB OVERSIGHT</FieldLabel><div className="admin-activity"><span className="activity-mark green"><CheckCircle2 size={15} /></span><div><strong>{store.metrics.openJobs} open jobs</strong><p>Posted records available for pilot review</p></div></div><div className="admin-activity"><span className="activity-mark mustard"><Send size={15} /></span><div><strong>{store.metrics.completedJobs} completed jobs</strong><p>Completion records held in the database</p></div></div><div className="admin-activity"><span className="activity-mark terracotta"><Flag size={15} /></span><div><strong>{store.metrics.openReports} reports need review</strong><p>Moderation queue is server-backed</p></div></div></div></div></section>;
  return <><section className="stat-row admin-stats"><Metric label="Registered users" value={String(store.metrics.registeredUsers).padStart(2, "0")} detail={`${store.metrics.fundiUsers} fundis · ${store.metrics.clientUsers} clients`} tone="green" icon={<Users size={17} />} /><Metric label="Jobs posted" value={String(store.metrics.jobsPosted).padStart(2, "0")} detail={`${store.metrics.openJobs} open right now`} tone="terracotta" icon={<ClipboardList size={17} />} /><Metric label="Completed jobs" value={String(store.metrics.completedJobs).padStart(2, "0")} detail="Stored completion records" tone="mustard" icon={<CheckCircle2 size={17} />} /><Metric label="Open reports" value={String(store.metrics.openReports).padStart(2, "0")} detail="Needs moderation" tone="ink" icon={<CircleAlert size={17} />} /></section><div className="admin-dashboard-grid"><section className="panel activity-panel"><PanelHeading eyebrow="LIVE ACTIVITY" title="What is happening" action={<span className="live-label"><Radio size={13} /> Live</span>} /><div className="activity-timeline"><div><span className="timeline-dot green" /><p><strong>{store.metrics.openJobs} open jobs</strong> are available in the pilot records <small>Database snapshot</small></p></div><div><span className="timeline-dot terracotta" /><p><strong>{store.metrics.completedJobs} jobs</strong> have reached completion <small>Database snapshot</small></p></div><div><span className="timeline-dot mustard" /><p><strong>{store.metrics.openReports} reports</strong> are waiting for review <small>Database snapshot</small></p></div></div></section><section className="panel admin-health"><PanelHeading eyebrow="PILOT HEALTH" title="Trust signals" /><div className="health-row"><span>Profiles with a trade</span><strong>{store.metrics.fundisWithTrade}/{store.metrics.fundiUsers}</strong><div className="health-track"><i style={{ width: `${store.metrics.fundiUsers ? Math.round((store.metrics.fundisWithTrade / store.metrics.fundiUsers) * 100) : 0}%` }} /></div></div><div className="health-row"><span>Jobs with a clear location</span><strong>{store.metrics.jobsWithLocation}/{store.metrics.jobsPosted}</strong><div className="health-track"><i style={{ width: `${store.metrics.jobsPosted ? Math.round((store.metrics.jobsWithLocation / store.metrics.jobsPosted) * 100) : 0}%` }} /></div></div><div className="health-row"><span>Completed jobs rated</span><strong>{store.metrics.ratedJobs}/{store.metrics.completedJobs}</strong><div className="health-track"><i style={{ width: `${store.metrics.completedJobs ? Math.round((store.metrics.ratedJobs / store.metrics.completedJobs) * 100) : 0}%` }} /></div></div><p className="admin-footnote"><LockKeyhole size={14} /> The pilot does not process payments or verify trade certificates.</p></section></div></>;
}

function FundiDrawer({ fundi, onClose }: { fundi: Fundi; onClose: () => void }) {
  return <div className="drawer-scrim" onClick={onClose}><aside className="fundi-drawer" onClick={(event) => event.stopPropagation()}><div className="drawer-top"><FieldLabel>FUNDI / PROFILE PREVIEW</FieldLabel><button className="icon-button" onClick={onClose} aria-label="Close fundi profile"><X size={18} /></button></div><div className="drawer-profile"><Avatar initials={fundi.initials} tone={fundi.tone} size="large" src={fundi.avatarUrl} /><div><h2>{fundi.name}</h2><p>{fundi.trades.join(" · ")}</p><span className="rating"><Star size={14} fill="currentColor" /> {fundi.rating} <em>from {fundi.ratings} completed jobs</em></span></div></div><div className="drawer-facts"><div><MapPin size={16} /><span><small>Service area</small><strong>{fundi.location} · {fundi.distance}</strong></span></div><div><Clock3 size={16} /><span><small>Availability</small><strong>{fundi.available ? "Available for new kazi" : "Currently away"}</strong></span></div><div><MessageCircle size={16} /><span><small>Response pattern</small><strong>{fundi.response}</strong></span></div></div><div className="drawer-note"><ShieldCheck size={17} /><p>Ratings are tied to recorded completed jobs. MjengoLink does not certify workmanship or identity.</p></div></aside></div>;
}

function JobModal({ form, setForm, onClose, onSubmit, editing = false }: { form: { trade: string; title: string; description: string; location: string; budget: string; startDate: string; contact: string }; setForm: (form: { trade: string; title: string; description: string; location: string; budget: string; startDate: string; contact: string }) => void; onClose: () => void; onSubmit: (event: FormEvent) => void; editing?: boolean }) {
  const update = (key: keyof typeof form, value: string) => setForm({ ...form, [key]: value });
  return <div className="modal-scrim" onClick={onClose}><section className="job-modal" onClick={(event) => event.stopPropagation()}><div className="modal-top"><div><div className="eyebrow"><span className="eyebrow-line" />{editing ? "EDIT JOB / OPEN POST" : "NEW OPPORTUNITY"}</div><h2>{editing ? "Edit your job" : "Post a job"}</h2><p>Give fundis enough detail to know if the kazi fits.</p></div><button className="icon-button" onClick={onClose} aria-label="Close post job form"><X size={19} /></button></div><form onSubmit={onSubmit}><div className="form-grid"><label><FieldLabel>TRADE NEEDED</FieldLabel><select value={form.trade} onChange={(event) => update("trade", event.target.value)} className="input">{trades.slice(1).map((trade) => <option key={trade}>{trade}</option>)}</select></label><label><FieldLabel>WHEN SHOULD IT START?</FieldLabel><input type="date" min={new Date().toISOString().slice(0, 10)} required value={form.startDate} onChange={(event) => update("startDate", event.target.value)} className="input" /></label></div><label><FieldLabel>JOB TITLE</FieldLabel><input value={form.title} onChange={(event) => update("title", event.target.value)} className="input" placeholder="e.g. Fix leaking roof in Kapsoya" /></label><label><FieldLabel>BRIEF DESCRIPTION</FieldLabel><textarea value={form.description} onChange={(event) => update("description", event.target.value)} className="input textarea" rows={4} placeholder="What needs doing? Mention size, materials or any access notes." /></label><div className="form-grid"><label><FieldLabel>ESTATE / LOCATION</FieldLabel><div className="input-with-icon"><MapPin size={16} /><input value={form.location} onChange={(event) => update("location", event.target.value)} className="input" /></div><small className="helper-text">You can use a landmark instead of sharing a precise pin.</small></label><label><FieldLabel>PROPOSED PAY (KSh)</FieldLabel><input value={form.budget} onChange={(event) => update("budget", event.target.value)} className="input" placeholder="e.g. 12000" inputMode="numeric" /></label></div><label><FieldLabel>HOW SHOULD A FUNDI CONTACT YOU?</FieldLabel><div className="contact-options">{["Call me", "Text me", "Either"].map((contact) => <button type="button" key={contact} className={form.contact === contact ? "contact-option selected" : "contact-option"} onClick={() => update("contact", contact)}>{contact}{form.contact === contact && <Check size={14} />}</button>)}</div></label><div className="modal-foot"><span><ShieldCheck size={15} />Location stays approximate until you choose to share.</span><button type="submit" className="primary-button"><Plus size={17} />Post job</button></div></form></section></div>;
}

function RatingModal({ job, onClose, onSubmit }: { job: Job; onClose: () => void; onSubmit: (score: number, comment: string) => void }) {
  const [score, setScore] = useState(5);
  const [comment, setComment] = useState("");
  return <div className="modal-scrim" onClick={onClose}><section className="rating-modal" onClick={(event) => event.stopPropagation()}><button className="icon-button modal-close" onClick={onClose} aria-label="Close rating"><X size={18} /></button><div className="rating-badge"><Star size={22} fill="currentColor" /></div><div className="eyebrow"><span className="eyebrow-line" />JOB FEEDBACK / {job.id}</div><h2>How did the kazi go?</h2><p>Your rating is linked to this completed job so future clients have useful context.</p><div className="star-row">{[1, 2, 3, 4, 5].map((item) => <button key={item} className={item <= score ? "star-button active" : "star-button"} onClick={() => setScore(item)} aria-label={`${item} stars`}><Star size={28} fill="currentColor" /></button>)}</div><textarea className="input textarea" rows={3} value={comment} onChange={(event) => setComment(event.target.value)} placeholder="Add a short note about the work (optional)" /><div className="modal-foot"><span><LockKeyhole size={14} />Only the job-linked record is shown.</span><button className="primary-button" onClick={() => onSubmit(score, comment)}>Save feedback</button></div></section></div>;
}

function FundiProfileModal({ form, setForm, onClose, onSubmit, pending }: { form: ProfileForm; setForm: (form: ProfileForm) => void; onClose: () => void; onSubmit: (event: FormEvent) => void; pending: boolean }) {
  const update = (key: keyof ProfileForm, value: string | boolean | string[]) => setForm({ ...form, [key]: value });
  const toggleTrade = (trade: string) => update("trades", form.trades.includes(trade) ? form.trades.filter(item => item !== trade) : [...form.trades, trade]);
  return <div className="modal-scrim" onClick={onClose}><section className="job-modal profile-modal" onClick={(event) => event.stopPropagation()}><div className="modal-top"><div><div className="eyebrow"><span className="eyebrow-line" />FUNDI PROFILE / MY DETAILS</div><h2>Put your work on record</h2><p>Keep your service area and skills clear so clients see a useful, honest profile.</p></div><button className="icon-button" onClick={onClose} aria-label="Close profile editor"><X size={19} /></button></div><form onSubmit={onSubmit}><div className="form-grid"><label><FieldLabel>PHONE / CONTACT</FieldLabel><input className="input" value={form.phone} onChange={(event) => update("phone", event.target.value)} placeholder="07xx xxx xxx" /></label><label><FieldLabel>SERVICE AREA</FieldLabel><input className="input" value={form.serviceArea} onChange={(event) => update("serviceArea", event.target.value)} placeholder="Kapsoya, Eldoret" /></label></div><label><FieldLabel>TRADE SKILLS</FieldLabel><div className="trade-checkboxes">{trades.slice(1).map((trade) => <button type="button" key={trade} className={`contact-option ${form.trades.includes(trade) ? "selected" : ""}`} onClick={() => toggleTrade(trade)}>{trade}{form.trades.includes(trade) && <Check size={14} />}</button>)}</div><small className="helper-text">Choose at least one skill. MjengoLink uses these skills when matching new kazi.</small></label><label><FieldLabel>EXPERIENCE</FieldLabel><input className="input" value={form.experience} onChange={(event) => update("experience", event.target.value)} placeholder="e.g. 8 years in masonry and tiling" /></label><label><FieldLabel>ABOUT YOUR WORK</FieldLabel><textarea className="input textarea" rows={3} value={form.summary} onChange={(event) => update("summary", event.target.value)} placeholder="What kind of work do you handle well?" /></label><label className="availability-check"><input type="checkbox" checked={form.availability} onChange={(event) => update("availability", event.target.checked)} /><span><strong>Available for nearby kazi</strong><small>Only available fundis receive matching job alerts.</small></span></label><div className="modal-foot"><span><MapPin size={15} />Use an estate or landmark; precise live location is not public.</span><button type="submit" className="primary-button" disabled={pending}>{pending ? "Saving…" : "Save profile"}</button></div></form></section></div>;
}

function ResponsesModal({ job, responders, loading, pendingDecision, pendingChat, onDecide, onOpenChat, onClose }: { job: Job; responders: JobResponderView[]; loading: boolean; pendingDecision: boolean; pendingChat: boolean; onDecide: (workerId: number, decision: "accept" | "decline") => void; onOpenChat: (workerId: number) => void; onClose: () => void }) {
  return <div className="modal-scrim" onClick={onClose}><section className="job-modal responses-modal" onClick={(event) => event.stopPropagation()}><div className="modal-top"><div><div className="eyebrow"><span className="eyebrow-line" />JOB INTEREST / {job.id}</div><h2>Who wants this job?</h2><p>Review each fundi, then accept one or decline. Only you can open the private chat.</p></div><button className="icon-button" onClick={onClose} aria-label="Close responses"><X size={19} /></button></div>{loading ? <div className="auth-loading"><span className="live-dot" />Loading responses…</div> : responders.length === 0 ? <EmptyState title="No interest yet" description="When a fundi shows interest, their profile will appear here for review." /> : <div className="response-list">{responders.map((responder) => {
    const accepted = responder.responseStatus === "Accepted";
    const declined = responder.responseStatus === "Declined";
    return <article className={`response-card ${accepted ? "accepted" : ""} ${declined ? "declined" : ""}`} key={responder.responseId}><div className="response-head"><Avatar initials={responder.initials} tone={responder.tone} src={responder.avatarUrl} /><div><strong>{responder.name}</strong><span>{responder.trades.join(" · ")}</span><span className="rating"><Star size={12} fill="currentColor" /> {responder.rating || "—"} <em>({responder.ratings} ratings)</em></span></div><span className="job-id">{accepted ? "Accepted" : declined ? "Declined" : "Interested"}</span></div><p>{responder.note}</p><div className="response-meta"><span><MapPin size={13} />{responder.location}</span><span><Clock3 size={13} />{responder.experience}</span></div><div className="response-actions">{accepted ? <button className="primary-button compact" disabled={pendingChat} onClick={() => onOpenChat(responder.workerId)}><MessageCircle size={15} />Open chat</button> : <><button className="primary-button compact" disabled={pendingDecision || declined} onClick={() => onDecide(responder.workerId, "accept")}><Check size={15} />Give job</button><button className="outline-button compact" disabled={pendingDecision || declined} onClick={() => onDecide(responder.workerId, "decline")}>Decline</button></>}</div></article>;
  })}</div>}</section></div>;
}

function NotificationModal({ notifications, loading, unreadCount, pending, onSelect, onMarkAll, onOpenInbox, onClose }: { notifications: AppNotificationView[]; loading: boolean; unreadCount: number; pending: boolean; onSelect: (notification: AppNotificationView) => void; onMarkAll: () => void; onOpenInbox: () => void; onClose: () => void }) {
  return <div className="modal-scrim" onClick={onClose}><section className="job-modal notification-modal" onClick={(event) => event.stopPropagation()}><div className="modal-top"><div><div className="eyebrow"><span className="eyebrow-line" />NOTIFICATIONS / {unreadCount} UNREAD</div><h2>What needs your attention</h2><p>New jobs, interest, job decisions and private messages appear here.</p></div><button className="icon-button" onClick={onClose} aria-label="Close notifications"><X size={19} /></button></div><div className="notification-toolbar"><button className="text-button" onClick={onOpenInbox}><MessageCircle size={14} />Open inbox</button>{unreadCount > 0 && <button className="outline-button compact" disabled={pending} onClick={onMarkAll}><Check size={14} />Mark all read</button>}</div>{loading ? <div className="auth-loading"><span className="live-dot" />Loading notifications…</div> : notifications.length === 0 ? <EmptyState title="You are all caught up" description="Notifications about new jobs, interest, job decisions and messages will show up here." /> : <div className="notification-list">{notifications.map((notification) => {
    const Icon = notification.type === "message" || notification.type === "chat" ? MessageCircle : notification.type === "decision" ? CheckCircle2 : notification.type === "job" ? ClipboardList : Users;
    return <button className={`notification-item ${notification.isRead ? "" : "unread"}`} key={notification.id} onClick={() => onSelect(notification)}><span className="notification-icon"><Icon size={16} /></span><span className="notification-copy"><strong>{notification.title}</strong><span>{notification.body}</span><small>{notification.createdAt}</small></span>{!notification.isRead && <i className="notification-dot" />}<ChevronRight size={15} /></button>;
  })}</div>}</section></div>;
}

function InboxModal({ conversations, loading, onSelect, onClose }: { conversations: InboxConversationView[]; loading: boolean; onSelect: (conversationId: number) => void; onClose: () => void }) {
  return <div className="modal-scrim" onClick={onClose}><section className="job-modal inbox-modal" onClick={(event) => event.stopPropagation()}><div className="modal-top"><div><div className="eyebrow"><span className="eyebrow-line" />PRIVATE INBOX</div><h2>Your conversations</h2><p>Messages are only visible to the two people on the job.</p></div><button className="icon-button" onClick={onClose} aria-label="Close inbox"><X size={19} /></button></div>{loading ? <div className="auth-loading"><span className="live-dot" />Loading conversations…</div> : conversations.length === 0 ? <EmptyState title="No conversations yet" description="After a client accepts a fundi, the client can open a private chat here." /> : <div className="inbox-list">{conversations.map((conversation) => <button className="inbox-item" key={conversation.id} onClick={() => onSelect(conversation.id)}><div><strong>{conversation.otherParty}</strong><span className="job-id">{conversation.jobTitle} · {conversation.lastMessageAt}</span></div><p>{conversation.lastMessage}</p>{conversation.unreadCount > 0 && <span className="unread-badge">{conversation.unreadCount}</span>}<ChevronRight size={16} /></button>)}</div>}</section></div>;
}

function ChatModal({ conversation, messages, draft, setDraft, pending, onSend, onBack, onClose }: { conversation: InboxConversationView; messages: InboxMessageView[]; draft: string; setDraft: (value: string) => void; pending: boolean; onSend: (event: FormEvent) => void; onBack: () => void; onClose: () => void }) {
  return <div className="modal-scrim" onClick={onClose}><section className="job-modal chat-modal" onClick={(event) => event.stopPropagation()}><div className="modal-top"><div><div className="eyebrow"><span className="eyebrow-line" />PRIVATE CHAT</div><h2>{conversation.otherParty}</h2><p>{conversation.jobTitle} · Started by the client</p></div><div className="chat-top-actions"><button className="icon-button" onClick={onBack} aria-label="Back to inbox"><ChevronRight size={18} className="back-arrow" /></button><button className="icon-button" onClick={onClose} aria-label="Close chat"><X size={19} /></button></div></div><div className="chat-thread">{messages.length === 0 ? <EmptyState title="Start the conversation" description="Agree on scope, timing and pay here before work begins." /> : messages.map((message) => <div className={`chat-bubble ${message.mine ? "mine" : ""}`} key={message.id}><span>{message.body}</span><small>{message.senderName} · {message.createdAt}</small></div>)}</div><form className="chat-composer" onSubmit={onSend}><input value={draft} onChange={(event) => setDraft(event.target.value)} maxLength={2000} placeholder="Write a message…" aria-label="Message" /><button className="primary-button" disabled={pending || !draft.trim()} type="submit"><Send size={15} />Send</button></form></section></div>;
}

function AccountPanel({ role, name, email, location, avatarUrl, photoPending, onPhoto, onRemovePhoto, onClose, onLogout }: { role: Role; name: string; email: string; location: string; avatarUrl?: string | null; photoPending: boolean; onPhoto: (file: File | undefined) => void; onRemovePhoto: () => void; onClose: () => void; onLogout: () => void }) {
  const isAdmin = role === "admin";
  return <div className="modal-scrim" onClick={onClose}><section className="account-modal" onClick={(event) => event.stopPropagation()}><div className="modal-top"><div><div className="eyebrow"><span className="eyebrow-line" />ACCOUNT / {isAdmin ? "ADMIN" : role.toUpperCase()}</div><h2>{name}</h2><p>{isAdmin ? "Pilot oversight account" : `${role === "client" ? "Client" : "Fundi"} account`}</p></div><button className="icon-button" onClick={onClose} aria-label="Close account panel"><X size={19} /></button></div><div className="account-identity"><Avatar initials={initialsFromName(name)} tone="ink" size="large" src={avatarUrl} /><div><strong>{name}</strong><span>{email}</span><span className="account-status"><i />Active session</span></div></div><div className="photo-actions"><label className="outline-button compact photo-upload"><Camera size={14} />{photoPending ? "Saving…" : avatarUrl ? "Change photo" : "Add photo"}<input accept="image/jpeg,image/png,image/webp" disabled={photoPending} onChange={(event) => onPhoto(event.target.files?.[0])} type="file" /></label>{avatarUrl && <button className="text-button danger-text" disabled={photoPending} onClick={onRemovePhoto}><Trash2 size={14} />Remove photo</button>}</div><div className="account-facts"><div><FieldLabel>ROLE</FieldLabel><strong>{isAdmin ? "Administrator" : role === "client" ? "Client" : "Construction fundi"}</strong></div><div><FieldLabel>ACCESS</FieldLabel><strong>{isAdmin ? "Moderation + pilot records" : "Jobs + profile"}</strong></div><div><FieldLabel>LOCATION</FieldLabel><strong>{location || "Not set"}</strong></div></div>{isAdmin ? <div className="account-note"><ShieldCheck size={17} /><p><strong>Admin access:</strong> this role is granted by the server account record; every protected admin action is checked server-side.</p></div> : <div className="account-note"><LockKeyhole size={17} /><p>Your account and workspace data are connected to the protected MjengoLink server APIs.</p></div>}<div className="account-actions"><button className="outline-button account-close" onClick={onClose}>Close account</button><button className="text-button danger-text" onClick={onLogout}>Sign out</button></div></section></div>;
}

export default Home;
