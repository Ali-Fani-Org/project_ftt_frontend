import {
	Tag,
	Zap,
	Clock,
	ListChecks,
	CalendarDays,
	Flag,
	Target,
	Lightbulb,
	Star,
	Heart,
	Code,
	Bug,
	Sparkles,
	GitBranch,
	GitPullRequest,
	RotateCw,
	Database,
	Layers,
	Puzzle,
	FlaskConical,
	CheckCircle,
	Rocket,
	Package,
	Server,
	Smartphone,
	Globe,
	Shield,
	Wrench,
	Users,
	Eye,
	Headphones,
	BookOpen,
	Palette,
	PenTool,
	FileText,
	Briefcase,
	Search,
	Coffee,
	Columns3,
	Cog,
	Key,
	Receipt,
	DollarSign,
	Phone,
	Mail,
	MessageCircle,
	Video,
	AlertTriangle
} from '@lucide/svelte';

/**
 * Curated lucide → tag icon map, mirroring the backend `ICON_CHOICES`
 * (`time_entries/constants.py`). Every key is an icon name string stored in
 * `Tag.icon`. Falls back to the generic `Tag` icon for unknown names so a
 * future backend icon never breaks rendering.
 */
export const TAG_ICONS = {
	tag: Tag,
	zap: Zap,
	clock: Clock,
	'list-checks': ListChecks,
	'calendar-days': CalendarDays,
	flag: Flag,
	target: Target,
	lightbulb: Lightbulb,
	star: Star,
	heart: Heart,
	code: Code,
	bug: Bug,
	sparkles: Sparkles,
	'git-branch': GitBranch,
	'git-pull-request': GitPullRequest,
	'rotate-cw': RotateCw,
	database: Database,
	layers: Layers,
	puzzle: Puzzle,
	'flask-conical': FlaskConical,
	'check-circle': CheckCircle,
	rocket: Rocket,
	package: Package,
	server: Server,
	smartphone: Smartphone,
	globe: Globe,
	shield: Shield,
	wrench: Wrench,
	users: Users,
	eye: Eye,
	headphones: Headphones,
	book: BookOpen,
	palette: Palette,
	'pen-tool': PenTool,
	'file-text': FileText,
	briefcase: Briefcase,
	search: Search,
	coffee: Coffee,
	columns: Columns3,
	cog: Cog,
	key: Key,
	receipt: Receipt,
	'dollar-sign': DollarSign,
	phone: Phone,
	mail: Mail,
	'message-circle': MessageCircle,
	video: Video,
	'alert-triangle': AlertTriangle
} as const;

export type TagIconName = keyof typeof TAG_ICONS;

/**
 * Human-friendly icon names, mirroring the backend `ICON_CHOICES` labels so
 * pickers don't show raw kebab-case names.
 */
export const TAG_ICON_LABELS: Record<TagIconName, string> = {
	tag: 'Tag',
	zap: 'Quick Task',
	clock: 'Time',
	'list-checks': 'Checklist',
	'calendar-days': 'Scheduling',
	flag: 'Milestone',
	target: 'Goal',
	lightbulb: 'Idea',
	star: 'Highlight',
	heart: 'Appreciation',
	code: 'Code',
	bug: 'Bug Fix',
	sparkles: 'New Feature',
	'git-branch': 'Branch',
	'git-pull-request': 'Pull Request',
	'rotate-cw': 'Refactor',
	database: 'Database',
	layers: 'Layers / Tiers',
	puzzle: 'Integration',
	'flask-conical': 'Trial / Lab',
	'check-circle': 'Testing / QA',
	rocket: 'Deployment',
	package: 'Release',
	server: 'DevOps / Server',
	smartphone: 'Mobile',
	globe: 'Web',
	shield: 'Security',
	wrench: 'Maintenance',
	users: 'Meeting',
	eye: 'Review',
	headphones: 'Support',
	book: 'Documentation',
	palette: 'Design',
	'pen-tool': 'Design Tool',
	'file-text': 'Notes / Report',
	briefcase: 'Client Work',
	search: 'Research',
	coffee: 'Break',
	columns: 'Planning',
	cog: 'Setup / Config',
	key: 'Access / Auth',
	receipt: 'Expenses',
	'dollar-sign': 'Billing',
	phone: 'Phone Call',
	mail: 'Email',
	'message-circle': 'Chat',
	video: 'Call',
	'alert-triangle': 'Urgent'
};

/** Resolve an icon name (backend `Tag.icon`) to a lucide component. */
export function getTagIcon(name: string) {
	const key = name in TAG_ICONS ? (name as TagIconName) : 'tag';
	return TAG_ICONS[key];
}

/** Resolve an icon name to its friendly label, falling back to the name itself. */
export function getTagIconLabel(name: string): string {
	const key = name in TAG_ICONS ? (name as TagIconName) : 'tag';
	return TAG_ICON_LABELS[key];
}

/**
 * Ordered (keywords, icon, color). First rule whose any-keyword matches wins.
 * Mirrors the backend `_TAG_STYLE_RULES` in `time_entries/utils.py`. Used to
 * auto-suggest an icon/color while typing a new tag title.
 */
const TAG_STYLE_RULES: [string[], TagIconName, string][] = [
	[['bug', 'debug', 'issue', 'incident'], 'bug', '#EF4444'],
	[['document', 'wiki'], 'book', '#14B8A6'],
	[['support', 'helpdesk', 'ticket'], 'headphones', '#F97316'],
	[['urgent', 'asap', 'critical', 'hotfix'], 'alert-triangle', '#EF4444'],
	[['review', 'approve', 'audit'], 'eye', '#F59E0B'],
	[['meet', 'standup', 'sync', '1-on-1', '1:1'], 'users', '#3B82F6'],
	[['feature', 'improve', 'enhance'], 'sparkles', '#8B5CF6'],
	[['mainten', 'tech debt'], 'wrench', '#F97316'],
	[['ui/ux', 'ui ', 'ux ', 'front end', 'interface'], 'palette', '#EC4899'],
	[['design', 'sketch'], 'palette', '#EC4899'],
	[['research', 'investigat', 'analysis', 'forecast'], 'search', '#06B6D4'],
	[['refactor', 'restructur', 'clean'], 'rotate-cw', '#14B8A6'],
	[['optimiz', 'perf', 'speed', 'cache', 'tune'], 'zap', '#F59E0B'],
	[['performance'], 'zap', '#F97316'],
	[['integration', 'integrat', 'connect', 'plugin'], 'puzzle', '#8B5CF6'],
	[['security', 'auth', 'login', 'password', 'vulnerab'], 'shield', '#EF4444'],
	[['database', 'sql', 'query', 'migrat'], 'database', '#F59E0B'],
	[['api', 'endpoint', 'rest', 'graphql'], 'server', '#0EA5E9'],
	[['backend', 'service'], 'database', '#0EA5E9'],
	[['frontend', 'web', 'website', 'browser', 'spa'], 'globe', '#06B6D4'],
	[['mobile', 'android', 'ios', 'flutter'], 'smartphone', '#22C55E'],
	[['deploy', 'release', 'launch', 'production', 'ship'], 'rocket', '#64748B'],
	[['planning', 'roadmap', 'sprint', 'backlog'], 'columns', '#22C55E'],
	[['schedule', 'calendar', 'event', 'deadline'], 'calendar-days', '#3B82F6'],
	[['test', 'qa', 'verif'], 'check-circle', '#84CC16'],
	[['call', 'zoom', 'google meet'], 'video', '#06B6D4'],
	[['phone', 'voip'], 'phone', '#6366F1'],
	[['email', 'mail'], 'mail', '#0EA5E9'],
	[['chat', 'message', 'slack', 'discord', 'teams'], 'message-circle', '#0EA5E9'],
	[['branch', 'git'], 'git-branch', '#6366F1'],
	[['pull request', ' merge'], 'git-pull-request', '#22C55E'],
	[['client', 'customer', 'vendor', 'stakeholder'], 'briefcase', '#8B5CF6'],
	[['billing', 'invoice', 'payment', 'finance', 'money'], 'dollar-sign', '#22C55E'],
	[['report', 'timesheet', 'log'], 'file-text', '#14B8A6'],
	[['milestone', 'goal', 'objective', 'okr'], 'target', '#22C55E'],
	[['idea', 'brainstorm'], 'lightbulb', '#F59E0B'],
	[['checklist', 'todo'], 'list-checks', '#14B8A6'],
	[['break', 'lunch'], 'coffee', '#A16207'],
	[['time', 'tracking'], 'clock', '#3B82F6'],
	[['development', 'dev', 'engineer', 'program', 'coding', 'implement'], 'code', '#3B82F6']
];

/** Infer a sensible icon + color for a tag from its title ('' → generic fallback). */
export function inferTagStyle(
	title: string
): { icon: TagIconName; color: string } {
	const t = ` ${title.toLowerCase()} `;
	for (const [keywords, icon, color] of TAG_STYLE_RULES) {
		if (keywords.some((k) => t.includes(k))) return { icon, color };
	}
	return { icon: 'tag', color: '#3B82F6' };
}