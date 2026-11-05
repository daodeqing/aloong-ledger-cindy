import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  Clock,
  CalendarDays,
  ListFilter,
  PieChart as PieChartIcon,
  Repeat,
  Bell,
  Trash2,
  Plus,
  Search,
  Sparkles,
  Download,
  RefreshCw,
  Check,
  X,
  ChevronLeft,
  ChevronRight,
  Sun,
  Moon,
  ArrowUpRight,
  ArrowDownRight,
  SlidersHorizontal,
  Edit3,
  RotateCcw,
  Pause,
  Play,
  Archive,
  CheckCircle2,
  BookOpen,
  Zap,
  Copy,
  LayoutList,
  LayoutGrid,
  BarChart3,
  Activity,
  Calendar,
} from 'lucide-react';
import {
  Bill,
  Subscription,
  ScheduledReminder,
  MonthSummary,
  TabType,
  EditorTab,
  BillKind,
  SubscriptionCycle,
  SubscriptionStatus,
  ReminderStatus,
} from './types';
import {
  formatMoney,
  getToday,
  calculateNextDue,
  validateReminderTime,
  parseAmount,
  LedgerError,
  groupBillsByDate,
} from './ledgerCore';
import { CATEGORIES, getCategoryLabel } from './ledgerCategories';
import { ledgerStorage } from './storage';
import { TrendChart } from './components/TrendChart';
import { PieChart } from './components/PieChart';
import { CategoryIcon } from './components/CategoryIcon';
import { parseLedgerTextLocally } from './aiParser';

function padZero(n: number): string {
  return String(n).padStart(2, '0');
}

function dateToLocalInput(d: Date): string {
  return `${d.getFullYear()}-${padZero(d.getMonth() + 1)}-${padZero(d.getDate())}T${padZero(
    d.getHours()
  )}:${padZero(d.getMinutes())}`;
}

function formatDueLabel(value: string, timezone: string): string {
  try {
    return new Intl.DateTimeFormat('zh-CN', {
      timeZone: timezone,
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function shiftMonth(ym: string, delta: number): string {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${padZero(d.getUTCMonth() + 1)}`;
}

function shiftDateStr(dateStr: string, deltaDays: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + deltaDays));
  return `${dt.getUTCFullYear()}-${padZero(dt.getUTCMonth() + 1)}-${padZero(dt.getUTCDate())}`;
}

function formatChineseMonthLabel(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  if (!y || !m) return ym;
  return `${y}年 ${padZero(m)}月`;
}

export const App: React.FC = () => {
  const today = useMemo(() => getToday(), []);
  const yesterday = useMemo(() => shiftDateStr(today, -1), [today]);
  const initialMonth = useMemo(() => today.slice(0, 7), [today]);
  const userTimezone = useMemo(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Shanghai',
    []
  );

  // Theme state
  const [isDark, setIsDark] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return document.documentElement.classList.contains('dark');
    }
    return false;
  });

  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDark]);

  // Core navigation & workspace states
  const [selectedMonth, setSelectedMonth] = useState<string>(initialMonth);
  const [summary, setSummary] = useState<MonthSummary | null>(null);
  const [dueCount, setDueCount] = useState<number>(0);
  const [activeTab, setActiveTab] = useState<TabType>('recent');
  const [activeEditor, setActiveEditor] = useState<EditorTab>('bill');
  const [inspectorOpen, setInspectorOpen] = useState<boolean>(true);
  const [billViewMode, setBillViewMode] = useState<'timeline' | 'grid'>('timeline');
  const [notice, setNotice] = useState<string>('');
  const [revision, setRevision] = useState<number>(0);

  useEffect(() => {
    const onSync = () => setRevision((r) => r + 1);
    window.addEventListener('ledger-sync-requested', onSync);
    return () => window.removeEventListener('ledger-sync-requested', onSync);
  }, []);


  // List & pagination
  const [items, setItems] = useState<Array<Bill | Subscription | ScheduledReminder>>([]);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [offset, setOffset] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  // Filters & Spotlight search
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [filterKind, setFilterKind] = useState<BillKind | 'all'>('all');
  const [filterFrom, setFilterFrom] = useState<string>('');
  const [filterTo, setFilterTo] = useState<string>('');
  const [filterCategory, setFilterCategory] = useState<string>('');
  const [filterSubStatus, setFilterSubStatus] = useState<SubscriptionStatus | 'all' | 'due'>('all');
  const [filterReminderStatus, setFilterReminderStatus] = useState<ReminderStatus | 'all'>('active');
  const [trashType, setTrashType] = useState<'bills' | 'subscriptions'>('bills');

  // Quick Omnibar AI input
  const [quickAiInput, setQuickAiInput] = useState<string>('');

  // Live preview of Quick AI input
  const liveAiPreview = useMemo(() => {
    const trimmed = quickAiInput.trim();
    if (!trimmed) return null;
    try {
      return parseLedgerTextLocally(trimmed);
    } catch {
      return null;
    }
  }, [quickAiInput]);

  // Trend chart day selection, style & scale toggle
  const [selectedDay, setSelectedDay] = useState<number>(() => {
    const dayNum = Number(today.slice(-2));
    return Number.isFinite(dayNum) && dayNum >= 1 ? dayNum : 1;
  });
  const [showTrendIncome, setShowTrendIncome] = useState<boolean>(false);
  const [trendChartStyle, setTrendChartStyle] = useState<'curve' | 'bar'>('curve');

  // Form: Bill
  const [billForm, setBillForm] = useState<{
    kind: BillKind;
    amount: string;
    category: string;
    occurredOn: string;
    note: string;
  }>({
    kind: 'expense',
    amount: '',
    category: 'food',
    occurredOn: today,
    note: '',
  });
  const [editBillId, setEditBillId] = useState<string | null>(null);
  const [billError, setBillError] = useState<string>('');

  // Form: Subscription
  const [subForm, setSubForm] = useState<{
    name: string;
    amount: string;
    cycle: SubscriptionCycle;
    category: string;
    nextDue: string;
    note: string;
  }>({
    name: '',
    amount: '',
    cycle: 'monthly',
    category: 'digital',
    nextDue: calculateNextDue(today, 'monthly', 1),
    note: '',
  });
  const [editSubId, setEditSubId] = useState<string | null>(null);
  const [subError, setSubError] = useState<string>('');

  // Form: Reminder
  const defaultDueTime = useMemo(() => {
    const d = new Date(Date.now() + 3600000);
    return dateToLocalInput(d);
  }, []);

  const [reminderForm, setReminderForm] = useState<{
    title: string;
    dueLocal: string;
    note: string;
  }>({
    title: '',
    dueLocal: defaultDueTime,
    note: '',
  });
  const [editReminderId, setEditReminderId] = useState<string | null>(null);
  const [reminderError, setReminderError] = useState<string>('');

  // Form: AI full tab
  const [aiText, setAiText] = useState<string>('');
  const [aiLoading, setAiLoading] = useState<boolean>(false);
  const [aiError, setAiError] = useState<string>('');

  // Agenda counts
  const [activeRemindersTotal, setActiveRemindersTotal] = useState<number>(0);
  const [nextReminderText, setNextReminderText] = useState<string>('暂无待办提醒');

  const editorRef = useRef<HTMLElement>(null);
  const billAmountRef = useRef<HTMLInputElement>(null);

  const expenseCategories = useMemo(
    () => CATEGORIES.filter((c) => c.type === 'expense'),
    []
  );
  const billCategoryOptions = useMemo(
    () => CATEGORIES.filter((c) => c.type === billForm.kind),
    [billForm.kind]
  );

  const showNotice = useCallback((msg: string) => {
    setNotice(msg);
    setTimeout(() => {
      setNotice((prev) => (prev === msg ? '' : prev));
    }, 4500);
  }, []);

  // Load Summary & Agenda
  const refreshSummary = useCallback(() => {
    try {
      const sum = ledgerStorage.getSummary(selectedMonth);
      setSummary(sum);

      const due = ledgerStorage.getDueItems();
      setDueCount(due.total);

      const rems = ledgerStorage.listReminders({ status: 'active', limit: 1 });
      setActiveRemindersTotal(rems.total);
      if (rems.items[0]) {
        const first = rems.items[0];
        setNextReminderText(`${first.title} · ${formatDueLabel(first.due_at, first.timezone)}`);
      } else {
        setNextReminderText('日常安排，在这里记住');
      }
    } catch (e) {
      console.error(e);
    }
  }, [selectedMonth]);

  // Load List Items
  const refreshList = useCallback(() => {
    setIsLoading(true);
    try {
      if (activeTab === 'categories') {
        setItems([]);
        setTotalCount(0);
        return;
      }

      if (activeTab === 'trash') {
        if (trashType === 'bills') {
          const res = ledgerStorage.queryBills({
            deletedOnly: true,
            offset,
            limit: 20,
          });
          setItems(res.items);
          setTotalCount(res.total);
        } else {
          const res = ledgerStorage.listSubscriptions({
            deletedOnly: true,
            offset,
            limit: 20,
          });
          setItems(res.items);
          setTotalCount(res.total);
        }
      } else if (activeTab === 'reminders') {
        const res = ledgerStorage.listReminders({
          status: filterReminderStatus,
          offset,
          limit: 20,
        });
        setItems(res.items);
        setTotalCount(res.total);
      } else if (activeTab === 'subscriptions') {
        const res = ledgerStorage.listSubscriptions({
          status: filterSubStatus,
          offset,
          limit: 20,
        });
        setItems(res.items);
        setTotalCount(res.total);
      } else {
        // recent, today, history
        const limit = activeTab === 'recent' && !searchQuery.trim() && !filterCategory ? 10 : 20;
        let from: string | undefined;
        let to: string | undefined;
        let category: string | undefined = filterCategory || undefined;

        if (activeTab === 'today') {
          from = today;
          to = today;
        } else if (activeTab === 'history') {
          if (filterFrom) from = filterFrom;
          if (filterTo) to = filterTo;
        }

        const res = ledgerStorage.queryBills({
          from,
          to,
          category,
          kind: activeTab === 'history' ? filterKind : 'all',
          query: searchQuery,
          offset,
          limit,
        });
        setItems(res.items);
        setTotalCount(res.total);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      showNotice(msg);
    } finally {
      setIsLoading(false);
    }
  }, [
    activeTab,
    trashType,
    filterReminderStatus,
    filterSubStatus,
    filterFrom,
    filterTo,
    filterCategory,
    filterKind,
    searchQuery,
    offset,
    today,
    showNotice,
  ]);

  useEffect(() => {
    refreshSummary();
    refreshList();
  }, [refreshSummary, refreshList, revision]);

  // Contextual navigation switch
  const handleTabChange = (tab: TabType) => {
    setActiveTab(tab);
    setOffset(0);
    if (tab === 'reminders') setActiveEditor('reminder');
    else if (tab === 'subscriptions') setActiveEditor('subscription');
    else setActiveEditor('bill');
  };

  const handleBillKindChange = (newKind: BillKind) => {
    const validCats = CATEGORIES.filter((c) => c.type === newKind);
    setBillForm((prev) => ({
      ...prev,
      kind: newKind,
      category: validCats.some((c) => c.key === prev.category)
        ? prev.category
        : validCats[0]?.key || (newKind === 'expense' ? 'food' : 'salary'),
    }));
  };

  const handleAddQuickAmount = (delta: number) => {
    setBillForm((prev) => {
      const current = parseFloat(prev.amount);
      const base = Number.isFinite(current) && current > 0 ? current : 0;
      return { ...prev, amount: (base + delta).toFixed(2) };
    });
    setBillError('');
  };

  const resetBillForm = () => {
    setEditBillId(null);
    setBillForm({
      kind: 'expense',
      amount: '',
      category: 'food',
      occurredOn: today,
      note: '',
    });
    setBillError('');
  };

  const resetSubForm = () => {
    setEditSubId(null);
    setSubForm({
      name: '',
      amount: '',
      cycle: 'monthly',
      category: 'digital',
      nextDue: calculateNextDue(today, 'monthly', 1),
      note: '',
    });
    setSubError('');
  };

  const resetReminderForm = () => {
    setEditReminderId(null);
    const d = new Date(Date.now() + 3600000);
    setReminderForm({
      title: '',
      dueLocal: dateToLocalInput(d),
      note: '',
    });
    setReminderError('');
  };

  const handleSubmitBill = (e: React.FormEvent) => {
    e.preventDefault();
    setBillError('');
    try {
      if (!billForm.amount) throw new LedgerError('INVALID_AMOUNT', '请填写金额');
      parseAmount(billForm.amount);

      if (editBillId) {
        ledgerStorage.editBill(editBillId, {
          kind: billForm.kind,
          amount: billForm.amount,
          category: billForm.category,
          note: billForm.note,
          occurredOn: billForm.occurredOn,
          action: 'edit',
        });
        showNotice('账单已更新。');
      } else {
        ledgerStorage.recordBill({
          kind: billForm.kind,
          amount: billForm.amount,
          category: billForm.category,
          note: billForm.note,
          occurredOn: billForm.occurredOn,
          source: 'manual',
        });
        showNotice('账单已保存。');
      }
      resetBillForm();
      setRevision((r) => r + 1);
    } catch (err: unknown) {
      setBillError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleSubmitSub = (e: React.FormEvent) => {
    e.preventDefault();
    setSubError('');
    try {
      if (!subForm.name.trim()) throw new LedgerError('INVALID_INPUT', '请填写订阅名称');
      if (!subForm.amount) throw new LedgerError('INVALID_AMOUNT', '请填写金额');
      parseAmount(subForm.amount);

      if (editSubId) {
        ledgerStorage.updateSubscription(editSubId, {
          name: subForm.name,
          amount: subForm.amount,
          category: subForm.category,
          cycle: subForm.cycle,
          nextDue: subForm.nextDue,
          note: subForm.note,
          action: 'update',
        });
        showNotice('订阅已更新。');
      } else {
        ledgerStorage.createSubscription({
          name: subForm.name,
          amount: subForm.amount,
          category: subForm.category,
          cycle: subForm.cycle,
          nextDue: subForm.nextDue,
          note: subForm.note,
        });
        showNotice('订阅已保存，到期后请确认或跳过本期。');
      }
      resetSubForm();
      setRevision((r) => r + 1);
    } catch (err: unknown) {
      setSubError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleSubmitReminder = (e: React.FormEvent) => {
    e.preventDefault();
    setReminderError('');
    try {
      if (!reminderForm.title.trim()) throw new LedgerError('INVALID_INPUT', '请填写提醒内容');
      if (!reminderForm.dueLocal) throw new LedgerError('INVALID_TIME', '请选择提醒时间');

      const d = new Date(reminderForm.dueLocal);
      if (dateToLocalInput(d) !== reminderForm.dueLocal) {
        throw new LedgerError('INVALID_TIME', '所选时间不存在，请重新选择');
      }
      const dueAt = validateReminderTime(d.toISOString());

      if (editReminderId) {
        ledgerStorage.updateReminder(editReminderId, {
          title: reminderForm.title,
          note: reminderForm.note,
          dueAt,
          timezone: userTimezone,
        });
        showNotice('提醒已更新。');
      } else {
        ledgerStorage.createReminder({
          title: reminderForm.title,
          note: reminderForm.note,
          dueAt,
          timezone: userTimezone,
        });
        showNotice('提醒已保存，将在电脑唤醒且浏览器运行时检查。');
      }
      resetReminderForm();
      setRevision((r) => r + 1);
    } catch (err: unknown) {
      setReminderError(err instanceof Error ? err.message : String(err));
    }
  };

  const applyParsedDraft = (textInput: string) => {
    const parsed = parseLedgerTextLocally(textInput);
    setInspectorOpen(true);
    if (parsed.type === 'bill') {
      resetBillForm();
      setBillForm({
        kind: parsed.kind,
        amount: parsed.amount,
        category: parsed.category,
        note: parsed.note,
        occurredOn: parsed.occurredOn,
      });
      setActiveEditor('bill');
      showNotice('AI 账单草稿已填入右侧面板，请核对金额、分类和日期后保存。');
    } else {
      resetSubForm();
      setSubForm({
        name: parsed.name,
        amount: parsed.amount,
        category: parsed.category,
        cycle: parsed.cycle,
        nextDue: parsed.nextDue,
        note: parsed.note,
      });
      setActiveEditor('subscription');
      showNotice('AI 订阅草稿已填入右侧面板，请核对周期和到期日后保存。');
    }
    editorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  };

  const handleInstantQuickRecord = () => {
    if (!liveAiPreview) return;
    try {
      if (liveAiPreview.type === 'bill') {
        ledgerStorage.recordBill({
          kind: liveAiPreview.kind,
          amount: liveAiPreview.amount,
          category: liveAiPreview.category,
          note: liveAiPreview.note,
          occurredOn: liveAiPreview.occurredOn,
          source: 'ai',
        });
        showNotice(
          `⚡ 已闪电入账：${getCategoryLabel(liveAiPreview.category)} ¥${liveAiPreview.amount}`
        );
      } else {
        ledgerStorage.createSubscription({
          name: liveAiPreview.name,
          amount: liveAiPreview.amount,
          category: liveAiPreview.category,
          cycle: liveAiPreview.cycle,
          nextDue: liveAiPreview.nextDue,
          note: liveAiPreview.note,
        });
        showNotice(`⚡ 已创建订阅：${liveAiPreview.name} ¥${liveAiPreview.amount}`);
      }
      setQuickAiInput('');
      setRevision((r) => r + 1);
    } catch (err: unknown) {
      showNotice(err instanceof Error ? err.message : String(err));
    }
  };

  const handleAiParse = (e: React.FormEvent) => {
    e.preventDefault();
    if (!aiText.trim()) {
      setAiError('请先描述一笔账单或订阅');
      return;
    }
    setAiError('');
    setAiLoading(true);
    try {
      applyParsedDraft(aiText);
    } catch (err: unknown) {
      setAiError(err instanceof Error ? err.message : String(err));
    } finally {
      setAiLoading(false);
    }
  };

  const handleQuickOmnibarSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickAiInput.trim()) return;
    applyParsedDraft(quickAiInput);
    setQuickAiInput('');
  };

  const handleDownload = (format: 'json' | 'csv') => {
    try {
      let content = '';
      let type = '';
      let name = '';
      if (format === 'json') {
        content = ledgerStorage.exportJson();
        type = 'application/json';
        name = `阿龍ai记账助手-${today}.json`;
      } else {
        content = ledgerStorage.exportCsv();
        type = 'text/csv;charset=utf-8';
        name = `阿龍ai记账助手-${today}.csv`;
      }
      const blob = new Blob([content], { type });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      showNotice(`已生成 ${name}；CSV 仅包含账单，完整备份请使用 JSON。`);
    } catch (err: unknown) {
      showNotice('导出失败：' + (err instanceof Error ? err.message : String(err)));
    }
  };

  // Filter by clicking a category in Donut chart or pill
  const handleSelectChartCategory = (categoryKey: string) => {
    if (filterCategory === categoryKey) {
      setFilterCategory('');
      showNotice('已恢复显示全部分类');
      return;
    }
    setFilterCategory(categoryKey);
    setFilterFrom(`${selectedMonth}-01`);
    setFilterTo(calculateNextDue(`${selectedMonth}-01`, 'monthly', 1));
    if (activeTab !== 'recent' && activeTab !== 'history') {
      setActiveTab('history');
    }
    setOffset(0);
    showNotice(`已筛选「${getCategoryLabel(categoryKey)}」分类账单，再次点击可取消`);
  };

  const currentTrendDay = useMemo(() => {
    if (!summary || !summary.daily.length) return null;
    const index = Math.min(Math.max(1, selectedDay), summary.daily.length) - 1;
    return summary.daily[index] || null;
  }, [summary, selectedDay]);

  const monthChangePercent = useMemo(() => {
    if (!summary || !summary.previous_expense_cents) return null;
    return (
      ((summary.expense_cents - summary.previous_expense_cents) /
        summary.previous_expense_cents) *
      100
    );
  }, [summary]);

  // Expense vs Income visual ratio
  const expenseRatioPercent = useMemo(() => {
    if (!summary) return 0;
    const totalFlow = summary.income_cents + summary.expense_cents;
    if (totalFlow <= 0) return 0;
    if (summary.income_cents > 0) {
      return Math.min(100, Math.round((summary.expense_cents / summary.income_cents) * 100));
    }
    return 100;
  }, [summary]);

  const isBillStreamTab =
    activeTab === 'recent' || activeTab === 'today' || activeTab === 'history';

  const billItemsOnly = useMemo(() => {
    if (!isBillStreamTab) return [];
    return items.filter(
      (item): item is Bill => 'amount_cents' in item && 'kind' in item && !('cycle' in item)
    );
  }, [items, isBillStreamTab]);

  const groupedBillTimeline = useMemo(() => {
    return groupBillsByDate(billItemsOnly, today);
  }, [billItemsOnly, today]);

  const tabTitles: Record<TabType, string> = {
    recent: '近期概览',
    today: '今日收支',
    history: '全部明细',
    subscriptions: '周期订阅',
    reminders: '生活提醒',
    categories: '分类报表',
    trash: '回收站',
  };

  const renderBillArticle = (b: Bill, compactCard = false) => {
    const isEditing = editBillId === b.id;
    const catLabel = b.category_label || getCategoryLabel(b.category);

    return (
      <article
        key={b.id}
        data-kind={b.kind}
        onClick={() => {
          if (b.deleted) return;
          setInspectorOpen(true);
          setEditBillId(b.id);
          setBillForm({
            kind: b.kind,
            amount: (b.amount_cents / 100).toFixed(2),
            category: b.category,
            occurredOn: b.occurred_on,
            note: b.note,
          });
          setActiveEditor('bill');
        }}
        className={`group relative transition-all duration-150 ${
          compactCard
            ? 'p-3.5 rounded-2xl border border-slate-200/75 dark:border-slate-800/90 bg-white/70 dark:bg-slate-900/60 hover:shadow-md hover:-translate-y-0.5'
            : 'px-4 py-3 hover:bg-slate-50/90 dark:hover:bg-slate-800/45'
        } flex items-center justify-between gap-3 ${b.deleted ? '' : 'cursor-pointer'} ${
          isEditing
            ? 'bg-blue-50/80 dark:bg-blue-950/35 ring-1 ring-inset ring-blue-500/30'
            : ''
        }`}
      >
        <div className="flex items-center gap-3.5 min-w-0 flex-1">
          <CategoryIcon category={b.category} size="md" selected={isEditing} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 min-w-0">
              <span className="font-semibold text-[13.5px] text-slate-900 dark:text-slate-100 truncate">
                {b.note ? b.note : catLabel}
              </span>
              {b.note && (
                <span className="px-1.5 py-0.5 rounded-md text-[10.5px] font-medium bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 shrink-0">
                  {catLabel}
                </span>
              )}
              {b.source === 'subscription' && (
                <span className="px-1.5 py-0.5 rounded-md text-[10px] font-medium bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-300 shrink-0">
                  周期扣款
                </span>
              )}
              {b.source === 'ai' && (
                <span className="px-1.5 py-0.5 rounded-md text-[10px] font-medium bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-300 shrink-0">
                  AI 快记
                </span>
              )}
            </div>
            <div className="text-[11px] text-slate-400 dark:text-slate-500 font-mono tabular-nums mt-0.5 flex items-center gap-2">
              <span>{b.occurred_on}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <div
            className={`text-[14.5px] font-bold font-mono tabular-nums tracking-tight ${
              b.kind === 'income'
                ? 'text-emerald-600 dark:text-emerald-400'
                : 'text-slate-900 dark:text-slate-100'
            }`}
          >
            {b.kind === 'income' ? '+' : '−'}¥{formatMoney(b.amount_cents)}
          </div>

          <div
            className="flex items-center gap-0.5 opacity-85 group-hover:opacity-100 transition-opacity"
            onClick={(e) => e.stopPropagation()}
          >
            {b.deleted ? (
              <button
                type="button"
                onClick={() => {
                  ledgerStorage.editBill(b.id, { action: 'restore' });
                  showNotice('已恢复账单。');
                  setRevision((r) => r + 1);
                }}
                className="px-2.5 py-1 rounded-lg text-xs font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/50 transition-colors flex items-center gap-1"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>恢复账单</span>
              </button>
            ) : (
              <>
                <button
                  type="button"
                  title="再来一笔（复制到今日）"
                  aria-label={`复制 ${catLabel} 账单`}
                  onClick={() => {
                    ledgerStorage.recordBill({
                      kind: b.kind,
                      amount: (b.amount_cents / 100).toFixed(2),
                      category: b.category,
                      note: b.note,
                      occurredOn: today,
                      source: 'manual',
                    });
                    showNotice(`已复制一笔「${catLabel} ¥${formatMoney(b.amount_cents)}」至今日`);
                    setRevision((r) => r + 1);
                  }}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50/80 dark:hover:bg-blue-950/40 transition-colors"
                >
                  <Copy className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  title="编辑账单"
                  aria-label={`编辑 ${catLabel} 账单`}
                  onClick={() => {
                    setInspectorOpen(true);
                    setEditBillId(b.id);
                    setBillForm({
                      kind: b.kind,
                      amount: (b.amount_cents / 100).toFixed(2),
                      category: b.category,
                      occurredOn: b.occurred_on,
                      note: b.note,
                    });
                    setActiveEditor('bill');
                  }}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-700 transition-colors"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  title="移入回收站"
                  aria-label={`删除 ${catLabel} 账单`}
                  onClick={() => {
                    ledgerStorage.editBill(b.id, { action: 'delete' });
                    if (editBillId === b.id) resetBillForm();
                    showNotice('已移入回收站，可在回收站随时恢复。');
                    setRevision((r) => r + 1);
                  }}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </>
            )}
          </div>
        </div>
      </article>
    );
  };

  return (
    <div className="min-h-dvh text-slate-900 dark:text-slate-100 flex flex-col lg:flex-row selection:bg-blue-500/15">
      {/* Floating macOS Glass Notice Toast */}
      {notice && (
        <div
          id="notice"
          role="status"
          aria-live="polite"
          className="fixed top-16 right-4 lg:right-6 z-50 max-w-md px-4 py-2.5 rounded-2xl bg-slate-900/90 dark:bg-slate-800/95 backdrop-blur-xl border border-white/15 text-xs font-medium text-white shadow-xl flex items-center gap-2.5 animate-in fade-in slide-in-from-top-2 duration-200"
        >
          <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
          <span className="leading-snug">{notice}</span>
          <button
            type="button"
            aria-label="关闭提示"
            onClick={() => setNotice('')}
            className="ml-1 text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* macOS Vibrancy Sidebar */}
      <aside
        aria-label="主导航侧边栏"
        className="w-full lg:w-[252px] shrink-0 bg-white/75 dark:bg-slate-900/75 backdrop-blur-2xl border-b lg:border-b-0 lg:border-r border-slate-200/80 dark:border-slate-800/80 flex flex-col justify-between lg:h-dvh lg:sticky lg:top-0 z-20"
      >
        <div className="space-y-4">
          {/* macOS Window Bar + Brand Wordmark */}
          <div className="h-14 px-4 flex items-center justify-between border-b border-slate-200/60 dark:border-slate-800/70">
            <div className="flex items-center gap-3 min-w-0">
              <div className="hidden lg:flex items-center gap-1.5" aria-hidden="true">
                <span className="w-3 h-3 rounded-full bg-[#ff5f57] border border-black/10 shadow-2xs" />
                <span className="w-3 h-3 rounded-full bg-[#febc2e] border border-black/10 shadow-2xs" />
                <span className="w-3 h-3 rounded-full bg-[#28c840] border border-black/10 shadow-2xs" />
              </div>
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-7 h-7 rounded-[9px] bg-gradient-to-br from-blue-500 via-blue-600 to-indigo-600 text-white flex items-center justify-center shadow-sm ring-1 ring-inset ring-white/30 shrink-0">
                  <BookOpen className="w-3.5 h-3.5" strokeWidth={2.3} />
                </div>
                <span className="font-bold text-[15px] tracking-tight text-slate-900 dark:text-white whitespace-nowrap truncate">
                  阿龍记账
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setIsDark((d) => !d)}
              aria-label={isDark ? '切换到浅色模式' : '切换到深色模式'}
              title={isDark ? '切换到浅色模式' : '切换到深色模式'}
              className="w-8 h-8 rounded-xl flex items-center justify-center text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-slate-800 transition-colors"
            >
              {isDark ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4" />}
            </button>
          </div>

          {/* Navigation Groups */}
          <nav aria-label="账本内容" className="px-3 space-y-4">
            <div>
              <div className="px-2.5 pb-1.5 text-[11px] font-semibold tracking-wider text-slate-400 dark:text-slate-500 hidden lg:block">
                账本动态
              </div>
              <div className="flex lg:flex-col gap-1 overflow-x-auto pb-1 lg:pb-0">
                {(
                  [
                    { key: 'recent', label: '近期概览', icon: Clock },
                    { key: 'today', label: '今日收支', icon: CalendarDays },
                    { key: 'history', label: '全部明细', icon: ListFilter },
                    { key: 'categories', label: '分类报表', icon: PieChartIcon },
                  ] as const
                ).map((nav) => {
                  const Icon = nav.icon;
                  const active = activeTab === nav.key;
                  return (
                    <button
                      key={nav.key}
                      type="button"
                      data-tab={nav.key}
                      aria-pressed={active}
                      onClick={() => handleTabChange(nav.key)}
                      className={`flex items-center gap-2.5 px-3 py-2 rounded-xl text-[13px] font-medium transition-all duration-150 whitespace-nowrap shrink-0 ${
                        active
                          ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-sm shadow-blue-500/20 font-semibold'
                          : 'text-slate-600 dark:text-slate-300 hover:bg-slate-200/55 dark:hover:bg-slate-800/70'
                      }`}
                    >
                      <Icon className="w-4 h-4 shrink-0" />
                      <span>{nav.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <div className="px-2.5 pb-1.5 text-[11px] font-semibold tracking-wider text-slate-400 dark:text-slate-500 hidden lg:block">
                待办与管家
              </div>
              <div className="flex lg:flex-col gap-1 overflow-x-auto pb-1 lg:pb-0">
                <button
                  type="button"
                  data-tab="subscriptions"
                  aria-pressed={activeTab === 'subscriptions'}
                  onClick={() => handleTabChange('subscriptions')}
                  className={`flex items-center justify-between gap-2 px-3 py-2 rounded-xl text-[13px] font-medium transition-all duration-150 whitespace-nowrap shrink-0 ${
                    activeTab === 'subscriptions'
                      ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-sm shadow-blue-500/20 font-semibold'
                      : 'text-slate-600 dark:text-slate-300 hover:bg-slate-200/55 dark:hover:bg-slate-800/70'
                  }`}
                >
                  <span className="flex items-center gap-2.5">
                    <Repeat className="w-4 h-4 shrink-0" />
                    <span>周期订阅</span>
                  </span>
                  {dueCount > 0 && (
                    <span
                      className={`px-1.5 py-0.5 rounded-md text-[10.5px] font-mono tabular-nums ${
                        activeTab === 'subscriptions'
                          ? 'bg-white/20 text-white'
                          : 'bg-amber-500/15 text-amber-600 dark:text-amber-400 font-semibold'
                      }`}
                    >
                      {dueCount} 待确认
                    </span>
                  )}
                </button>

                <button
                  type="button"
                  data-tab="reminders"
                  aria-pressed={activeTab === 'reminders'}
                  onClick={() => handleTabChange('reminders')}
                  className={`flex items-center justify-between gap-2 px-3 py-2 rounded-xl text-[13px] font-medium transition-all duration-150 whitespace-nowrap shrink-0 ${
                    activeTab === 'reminders'
                      ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-sm shadow-blue-500/20 font-semibold'
                      : 'text-slate-600 dark:text-slate-300 hover:bg-slate-200/55 dark:hover:bg-slate-800/70'
                  }`}
                >
                  <span className="flex items-center gap-2.5">
                    <Bell className="w-4 h-4 shrink-0" />
                    <span>生活提醒</span>
                  </span>
                  {activeRemindersTotal > 0 && (
                    <span
                      className={`px-1.5 py-0.5 rounded-md text-[11px] font-mono tabular-nums ${
                        activeTab === 'reminders'
                          ? 'bg-white/20 text-white'
                          : 'bg-slate-200/70 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      {activeRemindersTotal}
                    </span>
                  )}
                </button>

                <button
                  type="button"
                  data-tab="trash"
                  aria-pressed={activeTab === 'trash'}
                  onClick={() => handleTabChange('trash')}
                  className={`flex items-center gap-2.5 px-3 py-2 rounded-xl text-[13px] font-medium transition-all duration-150 whitespace-nowrap shrink-0 ${
                    activeTab === 'trash'
                      ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-sm shadow-blue-500/20 font-semibold'
                      : 'text-slate-600 dark:text-slate-300 hover:bg-slate-200/55 dark:hover:bg-slate-800/70'
                  }`}
                >
                  <Trash2 className="w-4 h-4 shrink-0" />
                  <span>回收站</span>
                </button>
              </div>
            </div>
          </nav>

          {/* Sidebar Cashflow Pulse & Quick Category Widget (Desktop) */}
          {summary && (
            <div className="hidden lg:block mx-3 p-3.5 rounded-2xl bg-gradient-to-br from-slate-100/90 via-white/80 to-blue-50/40 dark:from-slate-800/80 dark:via-slate-900/90 dark:to-indigo-950/30 border border-slate-200/80 dark:border-slate-800 shadow-2xs space-y-3">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-700 dark:text-slate-200">
                  本月收支水位
                </span>
                <span className="font-mono text-[11px] text-blue-600 dark:text-blue-400 font-semibold tabular-nums">
                  消耗 {expenseRatioPercent}%
                </span>
              </div>
              <div className="h-2 rounded-full bg-slate-200/80 dark:bg-slate-800 overflow-hidden p-0.5">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-blue-500 via-indigo-500 to-rose-500 transition-all duration-500"
                  style={{ width: `${Math.max(6, expenseRatioPercent)}%` }}
                />
              </div>
              <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
                <span>日均 ¥{formatMoney(summary.daily_average_cents)}</span>
                <span>共 {summary.bill_count} 笔流水</span>
              </div>

              {/* Quick Top Expense Category Pills in Sidebar */}
              {summary.categories.filter((c) => c.kind === 'expense').length > 0 && (
                <div className="pt-2 border-t border-slate-200/60 dark:border-slate-800/80">
                  <div className="text-[10.5px] text-slate-400 dark:text-slate-500 mb-1.5">
                    高频支出快筛
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {summary.categories
                      .filter((c) => c.kind === 'expense')
                      .slice(0, 4)
                      .map((c) => {
                        const isSelected = filterCategory === c.category;
                        return (
                          <button
                            key={c.category}
                            type="button"
                            onClick={() => handleSelectChartCategory(c.category)}
                            className={`px-2 py-1 rounded-lg text-[11px] font-medium transition-all flex items-center gap-1 ${
                              isSelected
                                ? 'bg-blue-600 text-white shadow-2xs'
                                : 'bg-white/90 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-blue-50 dark:hover:bg-slate-700 border border-slate-200/60 dark:border-slate-700/60'
                            }`}
                          >
                            <span>{c.label}</span>
                          </button>
                        );
                      })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Bottom Sidebar Actions (Export & Refresh) */}
        <div className="hidden lg:block p-3 border-t border-slate-200/70 dark:border-slate-800/80 space-y-2">
          <div className="grid grid-cols-2 gap-1.5">
            <button
              id="json"
              type="button"
              onClick={() => handleDownload('json')}
              className="flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-medium text-slate-600 dark:text-slate-300 bg-slate-100/90 dark:bg-slate-800/80 hover:bg-white dark:hover:bg-slate-800 border border-slate-200/60 dark:border-slate-700/60 shadow-2xs transition-all whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
              <span>备份 JSON</span>
            </button>
            <button
              id="csv"
              type="button"
              onClick={() => handleDownload('csv')}
              className="flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-medium text-slate-600 dark:text-slate-300 bg-slate-100/90 dark:bg-slate-800/80 hover:bg-white dark:hover:bg-slate-800 border border-slate-200/60 dark:border-slate-700/60 shadow-2xs transition-all whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              <span>表格 CSV</span>
            </button>
          </div>
          <div className="flex items-center justify-between px-1 text-[11px] text-slate-400 dark:text-slate-500">
            <span>本地隐私存储 · CNY</span>
            <button
              id="refresh"
              type="button"
              onClick={() => {
                setRevision((r) => r + 1);
                showNotice('账本数据已同步刷新。');
              }}
              className="inline-flex items-center gap-1 hover:text-slate-700 dark:hover:text-slate-300 transition-colors"
            >
              <RefreshCw className="w-3 h-3" />
              <span>同步</span>
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Top macOS Contextual Toolbar (3-Zone Contract) */}
        <header className="h-14 px-4 lg:px-6 bg-white/75 dark:bg-slate-900/75 backdrop-blur-2xl border-b border-slate-200/80 dark:border-slate-800/80 sticky top-0 z-10 flex items-center justify-between gap-3">
          {/* Zone 1: Contextual Breadcrumb + Custom Chinese Month Stepper */}
          <div className="flex items-center gap-3 min-w-0 shrink-0">
            <div className="flex items-center gap-1.5 text-sm">
              <span className="text-slate-400 dark:text-slate-500 hidden sm:inline">账本工作台</span>
              <span className="text-slate-300 dark:text-slate-700 hidden sm:inline">/</span>
              <h1 className="font-bold text-slate-900 dark:text-white whitespace-nowrap">
                {tabTitles[activeTab]}
              </h1>
            </div>

            {/* Tactile Chinese Month Stepper with overlaid #month input */}
            <div className="flex items-center bg-slate-100/90 dark:bg-slate-800/90 rounded-xl p-0.5 border border-slate-200/70 dark:border-slate-700/70 shadow-2xs">
              <button
                type="button"
                aria-label="上一月"
                onClick={() => {
                  setSelectedMonth((m) => shiftMonth(m, -1));
                  setOffset(0);
                }}
                className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-white dark:hover:bg-slate-700 transition-all"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>

              <div className="relative flex items-center justify-center px-2.5 py-0.5">
                <Calendar className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 mr-1.5 pointer-events-none" />
                <span className="text-xs font-mono font-semibold text-slate-800 dark:text-slate-100 whitespace-nowrap pointer-events-none">
                  {formatChineseMonthLabel(selectedMonth)}
                </span>
                <input
                  id="month"
                  type="month"
                  aria-label="汇总月份"
                  value={selectedMonth}
                  onChange={(e) => {
                    if (e.target.value) {
                      setSelectedMonth(e.target.value);
                      setOffset(0);
                    }
                  }}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                />
              </div>

              <button
                type="button"
                aria-label="下一月"
                onClick={() => {
                  setSelectedMonth((m) => shiftMonth(m, 1));
                  setOffset(0);
                }}
                className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-white dark:hover:bg-slate-700 transition-all"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>

            {selectedMonth !== initialMonth && (
              <button
                type="button"
                onClick={() => {
                  setSelectedMonth(initialMonth);
                  setOffset(0);
                }}
                className="hidden xl:inline-flex px-2 py-1 rounded-lg text-[11px] font-medium text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/50 hover:bg-blue-100 transition-colors"
              >
                回到本月
              </button>
            )}
          </div>

          {/* Zone 2: Live Spotlight AI Omnibar with Real-time Recognition Badge */}
          <form
            onSubmit={handleQuickOmnibarSubmit}
            className="hidden md:flex items-center flex-1 max-w-xl bg-slate-100/90 dark:bg-slate-800/85 border border-slate-200/80 dark:border-slate-700/75 rounded-xl px-3 py-1.5 focus-within:bg-white dark:focus-within:bg-slate-900 focus-within:border-blue-500/80 focus-within:ring-2 focus-within:ring-blue-500/15 shadow-2xs transition-all"
          >
            <Sparkles className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0 mr-2" />
            <input
              type="text"
              value={quickAiInput}
              onChange={(e) => setQuickAiInput(e.target.value)}
              placeholder="一句话快记：如「下午茶咖啡 32 元」或「视频会员每月 25 元」..."
              aria-label="一句话智能记账输入框"
              className="w-full bg-transparent text-xs text-slate-800 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none"
            />
            {liveAiPreview && (
              <div className="flex items-center gap-1.5 ml-2 shrink-0">
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-mono font-medium bg-blue-50 dark:bg-blue-950/80 text-blue-700 dark:text-blue-300 border border-blue-200/60 dark:border-blue-800">
                  {liveAiPreview.type === 'bill'
                    ? `${getCategoryLabel(liveAiPreview.category)} ¥${liveAiPreview.amount}`
                    : `订阅 · ¥${liveAiPreview.amount}`}
                </span>
                <button
                  type="submit"
                  className="px-2 py-0.5 rounded-md text-[11px] font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-blue-500 whitespace-nowrap transition-colors"
                >
                  核对 ↵
                </button>
                <button
                  type="button"
                  onClick={handleInstantQuickRecord}
                  title="无需二次确认，直接入账"
                  className="px-2 py-0.5 rounded-md text-[11px] font-semibold text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 inline-flex items-center gap-0.5 whitespace-nowrap shadow-2xs"
                >
                  <Zap className="w-3 h-3" />
                  <span>快记</span>
                </button>
              </div>
            )}
          </form>

          {/* Zone 3: Primary Action */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              id="quickReminder"
              type="button"
              onClick={() => {
                setInspectorOpen(true);
                setActiveEditor('reminder');
                editorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
              }}
              className="px-3 py-1.5 rounded-xl text-xs font-medium text-slate-700 dark:text-slate-200 bg-white/90 dark:bg-slate-800/90 border border-slate-200/80 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/80 shadow-2xs transition-all flex items-center gap-1.5 whitespace-nowrap shrink-0"
            >
              <Bell className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
              <span className="hidden sm:inline">添加提醒</span>
            </button>

            <button
              id="quickAdd"
              type="button"
              onClick={() => {
                setInspectorOpen(true);
                setActiveEditor('bill');
                editorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                setTimeout(() => billAmountRef.current?.focus(), 100);
              }}
              className="px-3.5 py-1.5 rounded-xl text-xs font-semibold text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 transition-all flex items-center gap-1.5 shadow-sm shadow-blue-500/20 whitespace-nowrap shrink-0"
            >
              <Plus className="w-3.5 h-3.5" strokeWidth={2.5} />
              <span>记一笔</span>
            </button>
          </div>
        </header>

        {/* Workspace Content Container */}
        <main className="flex-1 p-4 lg:p-5 max-w-[1600px] w-full mx-auto space-y-4">
          {/* Top KPI & Analytics Bento Strip */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
            {/* Left 4 cols: Apple Card / Copilot Tactile Monthly Cashflow Vault */}
            <section
              aria-labelledby="overviewTitle"
              className="lg:col-span-4 mac-card rounded-2xl p-4 relative overflow-hidden flex flex-col justify-between"
            >
              {/* Subtle top ambient glow strip */}
              <div
                className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-blue-500 via-indigo-500 to-emerald-500"
                aria-hidden="true"
              />

              <div>
                <div className="flex items-center justify-between gap-2 mb-2.5">
                  <h2
                    id="overviewTitle"
                    className="text-xs font-semibold text-slate-500 dark:text-slate-400 flex items-center gap-1.5"
                  >
                    <span>{formatChineseMonthLabel(selectedMonth)} 净结余</span>
                  </h2>
                  <span className="px-2 py-0.5 rounded-full text-[11px] bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                    {summary ? summary.bill_count : 0} 笔入账
                  </span>
                </div>

                <div className="mb-3">
                  <strong
                    id="net"
                    className="text-3xl font-extrabold font-mono tabular-nums tracking-tight text-slate-900 dark:text-white block"
                  >
                    {summary ? `¥${formatMoney(summary.net_cents)}` : '—'}
                  </strong>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 flex items-center gap-1.5">
                    <span>
                      {monthChangePercent === null
                        ? '上月无支出记录，暂不比较环比'
                        : `支出环比 ${
                            monthChangePercent >= 0 ? '+' : ''
                          }${monthChangePercent.toFixed(1)}%`}
                    </span>
                    <span>·</span>
                    <span>日均支出 ¥{summary ? formatMoney(summary.daily_average_cents) : '0.00'}</span>
                  </p>
                </div>

                {/* Cashflow Dual Metric Pills + Ratio Bar */}
                <div className="grid grid-cols-2 gap-2.5 p-2.5 rounded-xl bg-slate-50/90 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-800">
                  <div>
                    <span className="text-[11px] text-slate-400 dark:text-slate-500 flex items-center gap-1">
                      <ArrowUpRight className="w-3.5 h-3.5 text-rose-500" />
                      本月支出
                    </span>
                    <strong
                      id="expense"
                      className="text-[15px] font-bold font-mono tabular-nums text-rose-600 dark:text-rose-400 mt-0.5 block"
                    >
                      {summary ? `¥${formatMoney(summary.expense_cents)}` : '—'}
                    </strong>
                  </div>
                  <div className="border-l border-slate-200/70 dark:border-slate-700/70 pl-2.5">
                    <span className="text-[11px] text-slate-400 dark:text-slate-500 flex items-center gap-1">
                      <ArrowDownRight className="w-3.5 h-3.5 text-emerald-500" />
                      本月收入
                    </span>
                    <strong
                      id="income"
                      className="text-[15px] font-bold font-mono tabular-nums text-emerald-600 dark:text-emerald-400 mt-0.5 block"
                    >
                      {summary ? `¥${formatMoney(summary.income_cents)}` : '—'}
                    </strong>
                  </div>
                </div>
              </div>

              {/* Bottom Interactive Agenda Pills inside Overview */}
              <div className="mt-3 pt-2.5 border-t border-slate-200/60 dark:border-slate-800/80 grid grid-cols-2 gap-2 text-xs">
                <button
                  id="goDue"
                  type="button"
                  onClick={() => {
                    setFilterSubStatus('due');
                    handleTabChange('subscriptions');
                  }}
                  className="px-2.5 py-1.5 rounded-xl bg-slate-100/80 dark:bg-slate-800/70 hover:bg-amber-50 dark:hover:bg-amber-950/30 border border-slate-200/60 dark:border-slate-700/60 flex items-center justify-between transition-colors"
                >
                  <span className="text-[11px] text-slate-600 dark:text-slate-300">待确认订阅</span>
                  <strong
                    id="due"
                    className={`font-mono text-[11px] tabular-nums ${
                      dueCount > 0
                        ? 'text-amber-600 dark:text-amber-400 font-bold'
                        : 'text-slate-700 dark:text-slate-200'
                    }`}
                  >
                    {dueCount} 项
                  </strong>
                </button>

                <button
                  id="agendaReminder"
                  type="button"
                  onClick={() => handleTabChange('reminders')}
                  className="px-2.5 py-1.5 rounded-xl bg-slate-100/80 dark:bg-slate-800/70 hover:bg-blue-50 dark:hover:bg-blue-950/30 border border-slate-200/60 dark:border-slate-700/60 flex items-center justify-between transition-colors truncate"
                  title={nextReminderText}
                >
                  <span className="text-[11px] text-slate-600 dark:text-slate-300">待办提醒</span>
                  <strong className="font-mono text-[11px] text-blue-600 dark:text-blue-400 tabular-nums">
                    {activeRemindersTotal} 项
                  </strong>
                </button>
              </div>
            </section>

            {/* Middle 4 cols: Interactive Bezier Spline / Bar Trend Chart */}
            <section
              aria-labelledby="trendTitle"
              className="lg:col-span-4 mac-card rounded-2xl p-4 flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between gap-2 mb-1">
                  <h2
                    id="trendTitle"
                    className="text-xs font-semibold text-slate-500 dark:text-slate-400"
                  >
                    每日收支脉搏
                  </h2>

                  <div className="flex items-center gap-1">
                    {/* Curve vs Bar Toggle */}
                    <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-0.5 rounded-lg">
                      <button
                        type="button"
                        onClick={() => setTrendChartStyle('curve')}
                        className={`px-1.5 py-0.5 rounded-md text-[10.5px] font-medium inline-flex items-center gap-1 transition-all ${
                          trendChartStyle === 'curve'
                            ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-2xs'
                            : 'text-slate-500 dark:text-slate-400'
                        }`}
                      >
                        <Activity className="w-3 h-3" />
                        <span>曲线</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setTrendChartStyle('bar')}
                        className={`px-1.5 py-0.5 rounded-md text-[10.5px] font-medium inline-flex items-center gap-1 transition-all ${
                          trendChartStyle === 'bar'
                            ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-2xs'
                            : 'text-slate-500 dark:text-slate-400'
                        }`}
                      >
                        <BarChart3 className="w-3 h-3" />
                        <span>柱状</span>
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={() => setShowTrendIncome((v) => !v)}
                      className={`text-[10.5px] font-medium px-2 py-1 rounded-lg transition-colors ${
                        showTrendIncome
                          ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:text-blue-600'
                      }`}
                    >
                      {showTrendIncome ? '含收入' : '仅支出'}
                    </button>
                  </div>
                </div>

                <div id="trendChart">
                  {summary && (
                    <TrendChart
                      days={summary.daily}
                      selectedDay={selectedDay}
                      onSelectDay={(d) => setSelectedDay(d)}
                      showIncome={showTrendIncome}
                      chartStyle={trendChartStyle}
                    />
                  )}
                </div>
              </div>

              {/* Sleek Interactive Day Pill Bar (replaces raw browser range slider) */}
              <div className="pt-2 border-t border-slate-200/60 dark:border-slate-800/80 flex items-center justify-between gap-2 text-[11px]">
                {/* Hidden accessible range input for automated tests */}
                <input
                  id="trendDay"
                  type="range"
                  min="1"
                  max={summary?.daily.length || 31}
                  value={selectedDay}
                  aria-label="查看某日收支"
                  onChange={(e) => setSelectedDay(Number(e.target.value))}
                  className="sr-only"
                />

                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    aria-label="前一天"
                    onClick={() => setSelectedDay((d) => Math.max(1, d - 1))}
                    className="p-1 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-slate-900 dark:hover:text-white transition-colors"
                  >
                    <ChevronLeft className="w-3 h-3" />
                  </button>
                  <p
                    id="trendDetail"
                    aria-live="polite"
                    className="font-mono tabular-nums text-slate-700 dark:text-slate-200 px-1"
                  >
                    {currentTrendDay
                      ? `${currentTrendDay.date.slice(5)} · 支 ¥${formatMoney(
                          currentTrendDay.expense_cents
                        )} · 收 ¥${formatMoney(currentTrendDay.income_cents)}`
                      : ''}
                  </p>
                  <button
                    type="button"
                    aria-label="后一天"
                    onClick={() =>
                      setSelectedDay((d) => Math.min(summary?.daily.length || 31, d + 1))
                    }
                    className="p-1 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-slate-900 dark:hover:text-white transition-colors"
                  >
                    <ChevronRight className="w-3 h-3" />
                  </button>
                </div>

                {currentTrendDay && (
                  <button
                    type="button"
                    onClick={() => {
                      setFilterFrom(currentTrendDay.date);
                      setFilterTo(currentTrendDay.date);
                      setFilterCategory('');
                      setActiveTab('history');
                      setOffset(0);
                    }}
                    className="px-2 py-0.5 rounded-md bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 font-medium hover:bg-blue-100 transition-colors shrink-0"
                  >
                    看当日明细
                  </button>
                )}
              </div>
            </section>

            {/* Right 4 cols: Interactive Category Donut Chart */}
            <section
              aria-labelledby="pieTitle"
              className="lg:col-span-4 mac-card rounded-2xl p-4 flex flex-col justify-between"
            >
              <div className="flex items-center justify-between gap-2 mb-1">
                <h2
                  id="pieTitle"
                  className="text-xs font-semibold text-slate-500 dark:text-slate-400"
                >
                  支出分类构成
                </h2>
                <div className="flex items-center gap-2">
                  {filterCategory && (
                    <button
                      type="button"
                      onClick={() => setFilterCategory('')}
                      className="text-[10.5px] font-medium text-blue-600 dark:text-blue-400 hover:underline"
                    >
                      清除筛选
                    </button>
                  )}
                  <span id="pieCount" className="text-[11px] text-slate-400 dark:text-slate-500">
                    {summary
                      ? `${summary.categories.filter((c) => c.kind === 'expense').length} 个支出项`
                      : ''}
                  </span>
                </div>
              </div>

              <div id="pieChart" className="my-auto">
                {summary && (
                  <PieChart
                    categories={summary.categories}
                    selectedCategory={filterCategory}
                    onSelectCategory={handleSelectChartCategory}
                  />
                )}
              </div>
            </section>
          </div>

          {/* Main Split Workspace: Master List (Left) + Contextual macOS Inspector (Right) */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
            {/* Master Activity Panel */}
            <section
              aria-labelledby="listHeading"
              className={`${
                inspectorOpen ? 'lg:col-span-7 xl:col-span-8' : 'lg:col-span-12'
              } mac-card rounded-2xl overflow-hidden`}
            >
              {/* List Top Header & Search/Filter Bar */}
              <div className="p-4 border-b border-slate-200/70 dark:border-slate-800/80 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <h2 id="listHeading" className="text-sm font-bold text-slate-900 dark:text-white">
                      {tabTitles[activeTab]}
                    </h2>
                    <span className="px-2 py-0.5 rounded-full text-[11px] bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                      共 {totalCount} 项
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    {/* Search input for bill tabs */}
                    {isBillStreamTab && (
                      <div className="relative">
                        <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                        <input
                          type="search"
                          value={searchQuery}
                          onChange={(e) => {
                            setSearchQuery(e.target.value);
                            setOffset(0);
                          }}
                          placeholder="搜索备注、分类或日期..."
                          aria-label="搜索账单备注或分类"
                          className="pl-8 pr-3 py-1 rounded-xl text-xs bg-slate-100/90 dark:bg-slate-800/90 border border-slate-200/60 dark:border-slate-700/60 focus:border-blue-500 focus:bg-white dark:focus:bg-slate-900 text-slate-800 dark:text-slate-100 focus:outline-none w-44 sm:w-52 transition-all"
                        />
                      </div>
                    )}

                    {/* Timeline vs Card Grid Switcher */}
                    {isBillStreamTab && (
                      <div
                        className="hidden sm:flex items-center bg-slate-100 dark:bg-slate-800 p-0.5 rounded-xl border border-slate-200/60 dark:border-slate-700/60"
                        role="group"
                        aria-label="列表布局切换"
                      >
                        <button
                          type="button"
                          onClick={() => setBillViewMode('timeline')}
                          title="时间轴分组视图"
                          className={`p-1 rounded-lg transition-all ${
                            billViewMode === 'timeline'
                              ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-2xs'
                              : 'text-slate-400 hover:text-slate-700'
                          }`}
                        >
                          <LayoutList className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setBillViewMode('grid')}
                          title="双列卡片视图"
                          className={`p-1 rounded-lg transition-all ${
                            billViewMode === 'grid'
                              ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-2xs'
                              : 'text-slate-400 hover:text-slate-700'
                          }`}
                        >
                          <LayoutGrid className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={() => setInspectorOpen((o) => !o)}
                      className="hidden lg:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-medium text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200/70 dark:hover:bg-slate-700 transition-colors"
                    >
                      <SlidersHorizontal className="w-3.5 h-3.5" />
                      <span>{inspectorOpen ? '收起工作台' : '展开工作台'}</span>
                    </button>
                  </div>
                </div>

                {/* Quick Category Filter Strip on Bill Stream Tabs */}
                {isBillStreamTab && summary && summary.categories.length > 0 && (
                  <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
                    <button
                      type="button"
                      onClick={() => {
                        setFilterCategory('');
                        setOffset(0);
                      }}
                      className={`px-2.5 py-1 rounded-xl text-xs font-medium transition-all shrink-0 ${
                        !filterCategory
                          ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-2xs'
                          : 'bg-slate-100/80 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 hover:bg-slate-200/70'
                      }`}
                    >
                      全部分类
                    </button>
                    {summary.categories.map((c) => {
                      const active = filterCategory === c.category;
                      return (
                        <button
                          key={`${c.kind}-${c.category}`}
                          type="button"
                          onClick={() => {
                            setFilterCategory(active ? '' : c.category);
                            setOffset(0);
                          }}
                          className={`px-2.5 py-1 rounded-xl text-xs font-medium transition-all inline-flex items-center gap-1.5 shrink-0 ${
                            active
                              ? 'bg-blue-600 text-white shadow-2xs'
                              : 'bg-slate-100/80 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-700'
                          }`}
                        >
                          <span>{c.label}</span>
                          <span
                            className={`text-[10px] font-mono ${
                              active ? 'text-white/85' : 'text-slate-400'
                            }`}
                          >
                            {c.count}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* Contextual Filter Controls for History Tab */}
                {activeTab === 'history' && (
                  <div
                    id="billControls"
                    className="pt-2 border-t border-slate-100 dark:border-slate-800/70 flex flex-wrap items-end gap-2.5 text-xs"
                  >
                    <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-0.5 rounded-xl">
                      {(['all', 'expense', 'income'] as const).map((k) => (
                        <button
                          key={k}
                          type="button"
                          onClick={() => {
                            setFilterKind(k);
                            setOffset(0);
                          }}
                          className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                            filterKind === k
                              ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-2xs'
                              : 'text-slate-500 dark:text-slate-400 hover:text-slate-900'
                          }`}
                        >
                          {k === 'all' ? '全部收支' : k === 'expense' ? '仅支出' : '仅收入'}
                        </button>
                      ))}
                    </div>

                    <label className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
                      <span>从</span>
                      <input
                        id="billFrom"
                        type="date"
                        value={filterFrom}
                        onChange={(e) => {
                          setFilterFrom(e.target.value);
                          setOffset(0);
                        }}
                        className="px-2 py-1 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200/70 dark:border-slate-700 text-slate-800 dark:text-slate-100 font-mono text-xs"
                      />
                    </label>

                    <label className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
                      <span>到</span>
                      <input
                        id="billTo"
                        type="date"
                        value={filterTo}
                        onChange={(e) => {
                          setFilterTo(e.target.value);
                          setOffset(0);
                        }}
                        className="px-2 py-1 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200/70 dark:border-slate-700 text-slate-800 dark:text-slate-100 font-mono text-xs"
                      />
                    </label>

                    <label className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
                      <span>分类</span>
                      <select
                        id="billCategory"
                        value={filterCategory}
                        onChange={(e) => {
                          setFilterCategory(e.target.value);
                          setOffset(0);
                        }}
                        className="px-2 py-1 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200/70 dark:border-slate-700 text-slate-800 dark:text-slate-100 text-xs"
                      >
                        <option value="">全部分类</option>
                        {CATEGORIES.map((c) => (
                          <option key={c.key} value={c.key}>
                            {c.label} ({c.type === 'expense' ? '支出' : '收入'})
                          </option>
                        ))}
                      </select>
                    </label>

                    {(filterFrom || filterTo || filterCategory || filterKind !== 'all' || searchQuery) && (
                      <button
                        type="button"
                        onClick={() => {
                          setFilterFrom('');
                          setFilterTo('');
                          setFilterCategory('');
                          setFilterKind('all');
                          setSearchQuery('');
                          setOffset(0);
                        }}
                        className="px-2.5 py-1 rounded-xl text-xs text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/40 transition-colors"
                      >
                        重置筛选
                      </button>
                    )}
                  </div>
                )}

                {activeTab === 'subscriptions' && (
                  <div
                    id="subControls"
                    className="pt-2 border-t border-slate-100 dark:border-slate-800/70 flex flex-wrap items-center justify-between gap-2 text-xs"
                  >
                    <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-0.5 rounded-xl">
                      {(
                        [
                          { key: 'all', label: '全部' },
                          { key: 'active', label: '启用中' },
                          { key: 'due', label: '到期待确认' },
                          { key: 'paused', label: '已暂停' },
                          { key: 'archived', label: '已归档' },
                        ] as const
                      ).map((st) => (
                        <button
                          key={st.key}
                          type="button"
                          onClick={() => {
                            setFilterSubStatus(st.key);
                            setOffset(0);
                          }}
                          className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
                            filterSubStatus === st.key
                              ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-2xs'
                              : 'text-slate-500 dark:text-slate-400 hover:text-slate-900'
                          }`}
                        >
                          {st.label}
                        </button>
                      ))}
                    </div>
                    <span className="text-slate-400 dark:text-slate-500">
                      估算月均订阅成本 ¥
                      {summary ? formatMoney(summary.subscriptions.estimated_monthly_cents) : '0.00'} ·
                      确认扣款后才入账
                    </span>
                  </div>
                )}

                {activeTab === 'reminders' && (
                  <div
                    id="reminderControls"
                    className="pt-2 border-t border-slate-100 dark:border-slate-800/70 flex flex-wrap items-center justify-between gap-2 text-xs"
                  >
                    <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-0.5 rounded-xl">
                      {(
                        [
                          { key: 'active', label: '待办提醒' },
                          { key: 'all', label: '全部' },
                          { key: 'completed', label: '已完成' },
                          { key: 'cancelled', label: '已取消' },
                        ] as const
                      ).map((st) => (
                        <button
                          key={st.key}
                          type="button"
                          onClick={() => {
                            setFilterReminderStatus(st.key);
                            setOffset(0);
                          }}
                          className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
                            filterReminderStatus === st.key
                              ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-2xs'
                              : 'text-slate-500 dark:text-slate-400 hover:text-slate-900'
                          }`}
                        >
                          {st.label}
                        </button>
                      ))}
                    </div>
                    <span id="reminderClock" className="text-slate-400 dark:text-slate-500 font-mono">
                      当前时区 {userTimezone}
                    </span>
                  </div>
                )}

                {activeTab === 'trash' && (
                  <div
                    id="trashControls"
                    className="pt-2 border-t border-slate-100 dark:border-slate-800/70 flex flex-wrap items-center justify-between gap-2 text-xs"
                  >
                    <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-0.5 rounded-xl">
                      <button
                        type="button"
                        onClick={() => {
                          setTrashType('bills');
                          setOffset(0);
                        }}
                        className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                          trashType === 'bills'
                            ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-2xs'
                            : 'text-slate-500 dark:text-slate-400'
                        }`}
                      >
                        已删除账单
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setTrashType('subscriptions');
                          setOffset(0);
                        }}
                        className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                          trashType === 'subscriptions'
                            ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-2xs'
                            : 'text-slate-500 dark:text-slate-400'
                        }`}
                      >
                        已删除订阅
                      </button>
                    </div>
                    <span className="text-slate-400 dark:text-slate-500">
                      回收站项目可随时恢复至原账本
                    </span>
                  </div>
                )}
              </div>

              {/* List Body */}
              <div id="list" aria-live="polite">
                {isLoading ? (
                  <div className="p-6 space-y-3">
                    <div className="h-12 rounded-xl bg-slate-100 dark:bg-slate-800 animate-pulse" />
                    <div className="h-12 rounded-xl bg-slate-100 dark:bg-slate-800 animate-pulse" />
                    <div className="h-12 rounded-xl bg-slate-100 dark:bg-slate-800 animate-pulse" />
                  </div>
                ) : activeTab === 'categories' ? (
                  summary && summary.categories.length > 0 ? (
                    <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {summary.categories.map((c, i) => {
                        const base =
                          c.kind === 'income' ? summary.income_cents : summary.expense_cents;
                        const percent = base ? Math.round((c.cents / base) * 100) : 0;
                        return (
                          <div
                            key={i}
                            onClick={() => handleSelectChartCategory(c.category)}
                            className="p-3.5 rounded-2xl border border-slate-200/70 dark:border-slate-800/90 bg-white/60 dark:bg-slate-900/50 hover:border-blue-500/40 hover:shadow-sm transition-all cursor-pointer"
                          >
                            <div className="flex items-center justify-between gap-3 mb-2.5">
                              <div className="flex items-center gap-2.5 min-w-0">
                                <CategoryIcon category={c.category} size="md" />
                                <div>
                                  <div className="font-semibold text-sm text-slate-800 dark:text-slate-100">
                                    {c.label}
                                  </div>
                                  <div className="text-[11px] text-slate-400 dark:text-slate-500">
                                    {c.kind === 'income' ? '收入项' : '支出项'} · 共 {c.count} 笔
                                  </div>
                                </div>
                              </div>
                              <div className="text-right font-mono tabular-nums">
                                <strong className="text-sm font-bold text-slate-900 dark:text-white block">
                                  ¥{formatMoney(c.cents)}
                                </strong>
                                <span className="text-[11px] text-slate-400 dark:text-slate-500">
                                  占比 {percent}%
                                </span>
                              </div>
                            </div>
                            <div
                              className="h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden"
                              role="img"
                              aria-label={`占 ${percent}%`}
                            >
                              <div
                                className={`h-full rounded-full ${
                                  c.kind === 'income'
                                    ? 'bg-gradient-to-r from-emerald-500 to-teal-400'
                                    : 'bg-gradient-to-r from-blue-600 to-indigo-500'
                                }`}
                                style={{ width: `${Math.max(4, percent)}%` }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="p-12 text-center">
                      <p className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                        这个月还没有分类统计数据
                      </p>
                      <p className="text-xs text-slate-400 dark:text-slate-500 mb-4">
                        记录第一笔收支后，这里会按分类展示占比与笔数。
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          setInspectorOpen(true);
                          setActiveEditor('bill');
                          billAmountRef.current?.focus();
                        }}
                        className="px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-blue-600 text-white hover:bg-blue-700 transition-colors"
                      >
                        立即记一笔
                      </button>
                    </div>
                  )
                ) : items.length === 0 ? (
                  <div className="p-12 text-center">
                    <p className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                      {activeTab === 'trash' && '回收站是空的'}
                      {activeTab === 'reminders' && '没有符合条件的生活提醒'}
                      {activeTab === 'subscriptions' && '没有符合条件的周期订阅'}
                      {activeTab === 'today' && '今天还没有记账记录'}
                      {(activeTab === 'history' || activeTab === 'recent') && '没有找到符合条件的账单'}
                    </p>
                    <p className="text-xs text-slate-400 dark:text-slate-500">
                      {activeTab === 'trash'
                        ? '已删除的账单和订阅会暂存在这里，支持随时恢复。'
                        : '在顶部一句话快记栏输入或使用右侧工作台即可新增记录。'}
                    </p>
                  </div>
                ) : isBillStreamTab ? (
                  billViewMode === 'grid' ? (
                    <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                      {billItemsOnly.map((b) => renderBillArticle(b, true))}
                    </div>
                  ) : (
                    /* Date-Grouped Timeline Journal View */
                    <div className="divide-y divide-slate-100 dark:divide-slate-800/80">
                      {groupedBillTimeline.map((group) => (
                        <div key={group.date}>
                          <div className="px-4 py-2 bg-slate-50/80 dark:bg-slate-800/40 flex items-center justify-between text-[11px] font-medium text-slate-500 dark:text-slate-400 border-b border-slate-100 dark:border-slate-800/60">
                            <span className="font-semibold text-slate-600 dark:text-slate-300">
                              {group.label}
                            </span>
                            <div className="flex items-center gap-3 font-mono tabular-nums">
                              {group.expense_cents > 0 && (
                                <span>支 ¥{formatMoney(group.expense_cents)}</span>
                              )}
                              {group.income_cents > 0 && (
                                <span className="text-emerald-600 dark:text-emerald-400">
                                  收 +¥{formatMoney(group.income_cents)}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="divide-y divide-slate-100/80 dark:divide-slate-800/60">
                            {group.items.map((b) => renderBillArticle(b, false))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )
                ) : (
                  <div className="divide-y divide-slate-100 dark:divide-slate-800/80">
                    {items.map((item) => {
                      // 1. Deleted Bill Row in Trash
                      if ('amount_cents' in item && 'kind' in item && !('cycle' in item)) {
                        return renderBillArticle(item as Bill, false);
                      }

                      // 2. Subscription Row
                      if ('cycle' in item) {
                        const s = item as Subscription;
                        const isDue = s.status === 'active' && s.next_due <= today;
                        const isEditing = editSubId === s.id;
                        const cycleLabels: Record<string, string> = {
                          weekly: '每周',
                          monthly: '每月',
                          yearly: '每年',
                        };
                        const statusLabels: Record<string, string> = {
                          active: '启用中',
                          paused: '已暂停',
                          archived: '已归档',
                        };
                        const periodKey = s.period_key || `${s.id}:${s.next_due}`;

                        return (
                          <article
                            key={s.id}
                            onClick={() => {
                              if (s.deleted) return;
                              setInspectorOpen(true);
                              setEditSubId(s.id);
                              setSubForm({
                                name: s.name,
                                amount: (s.amount_cents / 100).toFixed(2),
                                cycle: s.cycle,
                                category: s.category,
                                nextDue: s.next_due,
                                note: s.note,
                              });
                              setActiveEditor('subscription');
                            }}
                            className={`px-4 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-colors ${
                              s.deleted ? '' : 'cursor-pointer'
                            } ${
                              isEditing
                                ? 'bg-blue-50/70 dark:bg-blue-950/30'
                                : 'hover:bg-slate-50/90 dark:hover:bg-slate-800/40'
                            }`}
                          >
                            <div className="flex items-start gap-3.5 min-w-0">
                              <CategoryIcon category={s.category} size="md" selected={isEditing} />
                              <div className="min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-semibold text-sm text-slate-900 dark:text-slate-100">
                                    {s.name}
                                  </span>
                                  <span className="text-xs text-slate-400 dark:text-slate-500">
                                    · {statusLabels[s.status]} · {cycleLabels[s.cycle]} · 下次扣款{' '}
                                    <span className="font-mono tabular-nums">{s.next_due}</span>
                                  </span>
                                  {isDue && (
                                    <span className="px-2 py-0.5 rounded-md text-[10.5px] font-semibold bg-amber-500/15 text-amber-600 dark:text-amber-400">
                                      到期待确认
                                    </span>
                                  )}
                                </div>
                                {s.note && (
                                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                                    {s.note}
                                  </p>
                                )}

                                {/* Subscription Action Bar */}
                                <div
                                  className="flex items-center flex-wrap gap-1.5 mt-2"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  {s.deleted ? (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        ledgerStorage.updateSubscription(s.id, {
                                          action: 'restore',
                                        });
                                        showNotice('已恢复订阅。');
                                        setRevision((r) => r + 1);
                                      }}
                                      className="px-2.5 py-1 rounded-lg text-xs font-medium text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/50"
                                    >
                                      恢复订阅
                                    </button>
                                  ) : (
                                    <>
                                      {isDue && (
                                        <>
                                          <button
                                            type="button"
                                            data-act="confirm"
                                            onClick={() => {
                                              ledgerStorage.confirmSubscriptionCharge(
                                                s.id,
                                                periodKey
                                              );
                                              showNotice('本期已确认入账。');
                                              setRevision((r) => r + 1);
                                            }}
                                            className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-blue-600 text-white hover:bg-blue-700 transition-colors"
                                          >
                                            确认已扣款
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => {
                                              ledgerStorage.skipSubscriptionPeriod(
                                                s.id,
                                                periodKey
                                              );
                                              showNotice('已跳过本期，不产生账单。');
                                              setRevision((r) => r + 1);
                                            }}
                                            className="px-2.5 py-1 rounded-lg text-xs font-medium bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                                          >
                                            跳过本期
                                          </button>
                                        </>
                                      )}
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setInspectorOpen(true);
                                          setEditSubId(s.id);
                                          setSubForm({
                                            name: s.name,
                                            amount: (s.amount_cents / 100).toFixed(2),
                                            cycle: s.cycle,
                                            category: s.category,
                                            nextDue: s.next_due,
                                            note: s.note,
                                          });
                                          setActiveEditor('subscription');
                                        }}
                                        className="px-2 py-1 rounded-lg text-xs text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors inline-flex items-center gap-1"
                                      >
                                        <Edit3 className="w-3 h-3" />
                                        <span>编辑</span>
                                      </button>
                                      {s.status === 'active' ? (
                                        <button
                                          type="button"
                                          onClick={() => {
                                            ledgerStorage.updateSubscription(s.id, {
                                              status: 'paused',
                                            });
                                            showNotice('已暂停订阅。');
                                            setRevision((r) => r + 1);
                                          }}
                                          className="px-2 py-1 rounded-lg text-xs text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors inline-flex items-center gap-1"
                                        >
                                          <Pause className="w-3 h-3" />
                                          <span>暂停</span>
                                        </button>
                                      ) : (
                                        <button
                                          type="button"
                                          onClick={() => {
                                            ledgerStorage.updateSubscription(s.id, {
                                              status: 'active',
                                            });
                                            showNotice('已启用订阅。');
                                            setRevision((r) => r + 1);
                                          }}
                                          className="px-2 py-1 rounded-lg text-xs text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors inline-flex items-center gap-1"
                                        >
                                          <Play className="w-3 h-3" />
                                          <span>启用</span>
                                        </button>
                                      )}
                                      {s.status !== 'archived' && (
                                        <button
                                          type="button"
                                          onClick={() => {
                                            ledgerStorage.updateSubscription(s.id, {
                                              status: 'archived',
                                            });
                                            showNotice('已归档订阅。');
                                            setRevision((r) => r + 1);
                                          }}
                                          className="px-2 py-1 rounded-lg text-xs text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors inline-flex items-center gap-1"
                                        >
                                          <Archive className="w-3 h-3" />
                                          <span>归档</span>
                                        </button>
                                      )}
                                      <button
                                        type="button"
                                        onClick={() => {
                                          ledgerStorage.updateSubscription(s.id, {
                                            action: 'delete',
                                          });
                                          if (editSubId === s.id) resetSubForm();
                                          showNotice('已移入回收站，历史扣款账单已保留。');
                                          setRevision((r) => r + 1);
                                        }}
                                        className="px-2 py-1 rounded-lg text-xs text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors inline-flex items-center gap-1"
                                      >
                                        <Trash2 className="w-3 h-3" />
                                        <span>删除</span>
                                      </button>
                                    </>
                                  )}
                                </div>
                              </div>
                            </div>

                            <div className="text-right font-mono tabular-nums shrink-0">
                              <strong className="text-sm font-bold text-slate-900 dark:text-white">
                                ¥{formatMoney(s.amount_cents)}
                              </strong>
                              <span className="block text-[11px] text-slate-400 dark:text-slate-500">
                                /{cycleLabels[s.cycle]}
                              </span>
                            </div>
                          </article>
                        );
                      }

                      // 3. Reminder Row
                      if ('due_at' in item) {
                        const rem = item as ScheduledReminder;
                        const active = rem.status === 'active';
                        const deliveryStateLabels: Record<string, string> = {
                          pending: '等待提醒',
                          sent: '已提交屏幕提示',
                          failed: '提示未送达，将重试',
                          uncertain: '投递结果待核实',
                        };

                        return (
                          <article
                            key={rem.id}
                            className="px-4 py-3.5 flex items-start justify-between gap-3 hover:bg-slate-50/90 dark:hover:bg-slate-800/40 transition-colors"
                          >
                            <div className="flex items-start gap-3.5 min-w-0">
                              <div className="w-10 h-10 rounded-[12px] bg-gradient-to-br from-blue-100 via-sky-50 to-indigo-100 dark:from-blue-500/25 dark:to-indigo-500/15 text-blue-600 dark:text-blue-300 ring-1 ring-inset ring-blue-200/80 dark:ring-blue-400/25 flex items-center justify-center shrink-0">
                                <Bell className="w-4 h-4" />
                              </div>
                              <div className="min-w-0">
                                <div className="font-semibold text-sm text-slate-900 dark:text-slate-100">
                                  {rem.title}
                                </div>
                                <div className="text-xs font-mono tabular-nums text-blue-600 dark:text-blue-400 mt-0.5">
                                  {formatDueLabel(rem.due_at, rem.timezone)}{' '}
                                  <span className="text-slate-400 dark:text-slate-500 text-[11px]">
                                    · {rem.timezone} ·{' '}
                                    {active
                                      ? deliveryStateLabels[rem.delivery_state] || '等待提醒'
                                      : rem.status === 'completed'
                                      ? '已完成'
                                      : '已取消'}
                                  </span>
                                </div>
                                {rem.note && (
                                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                                    {rem.note}
                                  </p>
                                )}

                                {active && (
                                  <div className="flex items-center flex-wrap gap-1.5 mt-2">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        ledgerStorage.updateReminder(rem.id, {
                                          status: 'completed',
                                        });
                                        showNotice('已标记提醒为完成。');
                                        setRevision((r) => r + 1);
                                      }}
                                      className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-700 transition-colors inline-flex items-center gap-1"
                                    >
                                      <CheckCircle2 className="w-3 h-3" />
                                      <span>标为完成</span>
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setInspectorOpen(true);
                                        setEditReminderId(rem.id);
                                        setReminderForm({
                                          title: rem.title,
                                          dueLocal: dateToLocalInput(new Date(rem.due_at)),
                                          note: rem.note,
                                        });
                                        setActiveEditor('reminder');
                                        editorRef.current?.scrollIntoView({
                                          behavior: 'smooth',
                                          block: 'nearest',
                                        });
                                      }}
                                      className="px-2.5 py-1 rounded-lg text-xs text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                                    >
                                      改期 / 编辑
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        ledgerStorage.updateReminder(rem.id, {
                                          status: 'cancelled',
                                        });
                                        showNotice('已取消提醒。');
                                        setRevision((r) => r + 1);
                                      }}
                                      className="px-2.5 py-1 rounded-lg text-xs text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors"
                                    >
                                      取消提醒
                                    </button>
                                  </div>
                                )}
                              </div>
                            </div>
                          </article>
                        );
                      }

                      return null;
                    })}
                  </div>
                )}
              </div>

              {/* Pagination Footer */}
              {activeTab !== 'recent' && activeTab !== 'categories' && totalCount > 20 && (
                <div
                  id="pager"
                  className="px-4 py-3 border-t border-slate-200/70 dark:border-slate-800 flex items-center justify-between text-xs"
                >
                  <button
                    id="prev"
                    type="button"
                    disabled={offset === 0}
                    onClick={() => setOffset((o) => Math.max(0, o - 20))}
                    className="px-3 py-1.5 rounded-xl font-medium bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 disabled:opacity-40"
                  >
                    上一页
                  </button>
                  <span id="pageInfo" className="font-mono tabular-nums text-slate-500">
                    {totalCount ? offset + 1 : 0}–{Math.min(offset + 20, totalCount)} / {totalCount}
                  </span>
                  <button
                    id="next"
                    type="button"
                    disabled={offset + 20 >= totalCount}
                    onClick={() => setOffset((o) => o + 20)}
                    className="px-3 py-1.5 rounded-xl font-medium bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 disabled:opacity-40"
                  >
                    下一页
                  </button>
                </div>
              )}
            </section>

            {/* Right Tactile macOS Inspector Panel */}
            {inspectorOpen && (
              <aside
                id="editor"
                ref={editorRef}
                aria-label="快速录入面板"
                className="lg:col-span-5 xl:col-span-4 mac-card rounded-2xl p-3.5 lg:sticky lg:top-16"
              >
                {/* macOS Segmented Control */}
                <div className="grid grid-cols-4 gap-1 p-1 bg-slate-100/90 dark:bg-slate-800/90 rounded-xl mb-2.5 border border-slate-200/50 dark:border-slate-700/50">
                  <button
                    id="showBill"
                    type="button"
                    aria-pressed={activeEditor === 'bill'}
                    onClick={() => setActiveEditor('bill')}
                    className={`py-1.5 px-2 rounded-lg text-xs font-semibold transition-all whitespace-nowrap ${
                      activeEditor === 'bill'
                        ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-2xs'
                        : 'text-slate-500 dark:text-slate-400 hover:text-slate-900'
                    }`}
                  >
                    手动记账
                  </button>
                  <button
                    id="showSub"
                    type="button"
                    aria-pressed={activeEditor === 'subscription'}
                    onClick={() => setActiveEditor('subscription')}
                    className={`py-1.5 px-2 rounded-lg text-xs font-semibold transition-all whitespace-nowrap ${
                      activeEditor === 'subscription'
                        ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-2xs'
                        : 'text-slate-500 dark:text-slate-400 hover:text-slate-900'
                    }`}
                  >
                    订阅
                  </button>
                  <button
                    id="showReminder"
                    type="button"
                    aria-pressed={activeEditor === 'reminder'}
                    onClick={() => setActiveEditor('reminder')}
                    className={`py-1.5 px-2 rounded-lg text-xs font-semibold transition-all whitespace-nowrap ${
                      activeEditor === 'reminder'
                        ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-2xs'
                        : 'text-slate-500 dark:text-slate-400 hover:text-slate-900'
                    }`}
                  >
                    提醒
                  </button>
                  <button
                    id="showAi"
                    type="button"
                    aria-pressed={activeEditor === 'ai'}
                    onClick={() => setActiveEditor('ai')}
                    className={`py-1.5 px-2 rounded-lg text-xs font-semibold transition-all whitespace-nowrap ${
                      activeEditor === 'ai'
                        ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-2xs'
                        : 'text-slate-500 dark:text-slate-400 hover:text-slate-900'
                    }`}
                  >
                    AI 录入
                  </button>
                </div>

                {/* 1. Tactile Manual Bill Composer (Fits 100% Above the Fold) */}
                {activeEditor === 'bill' && (
                  <form id="bill" onSubmit={handleSubmitBill} noValidate className="space-y-2.5">
                    {/* Integrated Hero Currency Card with Kind Switch + Quick Amount Chips */}
                    <div className="p-2.5 rounded-2xl bg-slate-50/90 dark:bg-slate-800/70 border border-slate-200/80 dark:border-slate-700/80 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <h2
                          id="billTitle"
                          className="text-xs font-semibold text-slate-500 dark:text-slate-400"
                        >
                          {editBillId ? '正在编辑账单金额' : '记录账单金额（元）'}
                        </h2>
                        <div className="flex items-center gap-1 bg-slate-200/70 dark:bg-slate-900/80 p-0.5 rounded-lg">
                          <button
                            type="button"
                            onClick={() => handleBillKindChange('expense')}
                            className={`px-2.5 py-0.5 rounded-md text-xs font-semibold transition-all ${
                              billForm.kind === 'expense'
                                ? 'bg-white dark:bg-slate-800 text-rose-600 dark:text-rose-400 shadow-2xs'
                                : 'text-slate-500 dark:text-slate-400'
                            }`}
                          >
                            支出
                          </button>
                          <button
                            type="button"
                            onClick={() => handleBillKindChange('income')}
                            className={`px-2.5 py-0.5 rounded-md text-xs font-semibold transition-all ${
                              billForm.kind === 'income'
                                ? 'bg-white dark:bg-slate-800 text-emerald-600 dark:text-emerald-400 shadow-2xs'
                                : 'text-slate-500 dark:text-slate-400'
                            }`}
                          >
                            收入
                          </button>
                        </div>
                      </div>

                      <div className="relative flex items-center">
                        <span
                          className={`text-xl font-mono font-bold mr-1.5 ${
                            billForm.kind === 'income'
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : 'text-rose-600 dark:text-rose-400'
                          }`}
                        >
                          ¥
                        </span>
                        <input
                          ref={billAmountRef}
                          name="amount"
                          inputMode="decimal"
                          placeholder="0.00"
                          required
                          maxLength={14}
                          autoComplete="off"
                          aria-label="金额（元）"
                          value={billForm.amount}
                          onChange={(e) =>
                            setBillForm((prev) => ({ ...prev, amount: e.target.value }))
                          }
                          className="w-full bg-transparent text-2xl font-mono font-extrabold tabular-nums text-slate-900 dark:text-white focus:outline-none placeholder:text-slate-300 dark:placeholder:text-slate-600"
                        />
                      </div>

                      {/* Quick Amount Booster Pills */}
                      <div className="flex items-center gap-1 pt-1 border-t border-slate-200/60 dark:border-slate-700/60">
                        <span className="text-[10.5px] text-slate-400 mr-1">快加:</span>
                        {[15, 30, 50, 100].map((amt) => (
                          <button
                            key={amt}
                            type="button"
                            onClick={() => handleAddQuickAmount(amt)}
                            className="px-2 py-0.5 rounded-md text-[11px] font-mono font-medium bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border border-slate-200/70 dark:border-slate-700 hover:border-blue-500 hover:text-blue-600 transition-colors"
                          >
                            +{amt}
                          </button>
                        ))}
                        {billForm.amount && (
                          <button
                            type="button"
                            onClick={() => setBillForm((prev) => ({ ...prev, amount: '' }))}
                            className="ml-auto text-[11px] text-slate-400 hover:text-rose-500 px-1.5"
                          >
                            清空
                          </button>
                        )}
                      </div>
                    </div>

                    {/* 6-Column Tactile Squircle Category Grid */}
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                          选择分类 ·{' '}
                          <strong className="text-slate-800 dark:text-slate-200">
                            {getCategoryLabel(billForm.category)}
                          </strong>
                        </span>
                      </div>
                      <div
                        role="radiogroup"
                        aria-label="账单分类选择"
                        className="grid grid-cols-6 gap-1 max-h-[210px] overflow-y-auto p-1.5 rounded-2xl bg-slate-50/80 dark:bg-slate-800/50 border border-slate-200/60 dark:border-slate-800"
                      >
                        {billCategoryOptions.map((c) => {
                          const selected = billForm.category === c.key;
                          return (
                            <button
                              key={c.key}
                              type="button"
                              role="radio"
                              aria-checked={selected}
                              onClick={() =>
                                setBillForm((prev) => ({ ...prev, category: c.key }))
                              }
                              className={`flex flex-col items-center justify-center gap-1 py-1.5 px-0.5 rounded-xl text-[10.5px] transition-all ${
                                selected
                                  ? 'bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-300 shadow-xs ring-1 ring-blue-500/40 font-semibold'
                                  : 'text-slate-600 dark:text-slate-400 hover:bg-white/70 dark:hover:bg-slate-800/70'
                              }`}
                            >
                              <CategoryIcon category={c.key} size="sm" selected={selected} />
                              <span className="truncate w-full text-center">{c.label}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Date (with Today/Yesterday Quick Chips) & Note */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1">
                          <span className="text-xs text-slate-500 dark:text-slate-400">日期</span>
                          <button
                            type="button"
                            onClick={() => setBillForm((p) => ({ ...p, occurredOn: today }))}
                            className={`px-1.5 py-0.5 rounded-md text-[10.5px] font-medium transition-colors ${
                              billForm.occurredOn === today
                                ? 'bg-blue-600 text-white'
                                : 'bg-slate-100 dark:bg-slate-800 text-slate-500'
                            }`}
                          >
                            今天
                          </button>
                          <button
                            type="button"
                            onClick={() => setBillForm((p) => ({ ...p, occurredOn: yesterday }))}
                            className={`px-1.5 py-0.5 rounded-md text-[10.5px] font-medium transition-colors ${
                              billForm.occurredOn === yesterday
                                ? 'bg-blue-600 text-white'
                                : 'bg-slate-100 dark:bg-slate-800 text-slate-500'
                            }`}
                          >
                            昨天
                          </button>
                        </div>
                        <input
                          name="occurredOn"
                          type="date"
                          aria-label="日期"
                          required
                          value={billForm.occurredOn}
                          onChange={(e) =>
                            setBillForm((prev) => ({ ...prev, occurredOn: e.target.value }))
                          }
                          className="px-2.5 py-1 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-mono text-slate-900 dark:text-white focus:outline-none focus:border-blue-500"
                        />
                      </div>

                      <label className="block text-xs text-slate-500 dark:text-slate-400">
                        <span className="sr-only">备注</span>
                        <input
                          name="note"
                          maxLength={300}
                          placeholder="添加备注：这笔钱花在了哪里？（可选）"
                          aria-label="备注"
                          value={billForm.note}
                          onChange={(e) =>
                            setBillForm((prev) => ({ ...prev, note: e.target.value }))
                          }
                          className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-blue-500"
                        />
                      </label>
                    </div>

                    {billError && (
                      <p id="billError" role="alert" className="text-xs text-rose-600 dark:text-rose-400">
                        {billError}
                      </p>
                    )}

                    <div className="flex items-center gap-2 pt-0.5">
                      <button
                        type="submit"
                        className="flex-1 py-2.5 px-4 rounded-xl text-xs font-semibold text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 transition-all flex items-center justify-center gap-1.5 shadow-sm shadow-blue-500/20"
                      >
                        <Check className="w-4 h-4" />
                        <span>{editBillId ? '更新账单' : '保存账单'}</span>
                      </button>
                      {editBillId && (
                        <button
                          id="cancelBill"
                          type="button"
                          onClick={resetBillForm}
                          className="py-2.5 px-3 rounded-xl text-xs font-medium text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200"
                        >
                          取消编辑
                        </button>
                      )}
                    </div>
                  </form>
                )}

                {/* 2. Subscription Form */}
                {activeEditor === 'subscription' && (
                  <form id="subscription" onSubmit={handleSubmitSub} noValidate className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h2 id="subTitle" className="text-sm font-bold text-slate-900 dark:text-white">
                        {editSubId ? '编辑周期订阅' : '添加周期订阅'}
                      </h2>
                      <span className="text-[11px] text-slate-400 font-mono">CNY</span>
                    </div>

                    <label className="block text-xs text-slate-500 dark:text-slate-400">
                      订阅名称
                      <input
                        name="name"
                        maxLength={80}
                        placeholder="例如：影音联合会员、家庭千兆宽带"
                        required
                        value={subForm.name}
                        onChange={(e) =>
                          setSubForm((prev) => ({ ...prev, name: e.target.value }))
                        }
                        className="mt-1 w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-blue-500"
                      />
                    </label>

                    <div className="grid grid-cols-2 gap-2.5">
                      <label className="block text-xs text-slate-500 dark:text-slate-400">
                        每期金额（元）
                        <input
                          name="amount"
                          inputMode="decimal"
                          placeholder="0.00"
                          required
                          maxLength={14}
                          autoComplete="off"
                          value={subForm.amount}
                          onChange={(e) =>
                            setSubForm((prev) => ({ ...prev, amount: e.target.value }))
                          }
                          className="mt-1 w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-mono font-semibold text-slate-900 dark:text-white focus:outline-none focus:border-blue-500"
                        />
                      </label>

                      <label className="block text-xs text-slate-500 dark:text-slate-400">
                        扣款周期
                        <select
                          name="cycle"
                          value={subForm.cycle}
                          onChange={(e) =>
                            setSubForm((prev) => ({
                              ...prev,
                              cycle: e.target.value as SubscriptionCycle,
                            }))
                          }
                          className="mt-1 w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-blue-500"
                        >
                          <option value="monthly">每月</option>
                          <option value="weekly">每周</option>
                          <option value="yearly">每年</option>
                        </select>
                      </label>
                    </div>

                    <div className="grid grid-cols-2 gap-2.5">
                      <label className="block text-xs text-slate-500 dark:text-slate-400">
                        所属分类
                        <select
                          name="category"
                          value={subForm.category}
                          onChange={(e) =>
                            setSubForm((prev) => ({ ...prev, category: e.target.value }))
                          }
                          className="mt-1 w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-blue-500"
                        >
                          {expenseCategories.map((c) => (
                            <option key={c.key} value={c.key}>
                              {c.label}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label className="block text-xs text-slate-500 dark:text-slate-400">
                        下次到期日
                        <input
                          name="nextDue"
                          type="date"
                          required
                          value={subForm.nextDue}
                          onChange={(e) =>
                            setSubForm((prev) => ({ ...prev, nextDue: e.target.value }))
                          }
                          className="mt-1 w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-mono text-slate-900 dark:text-white focus:outline-none focus:border-blue-500"
                        />
                      </label>
                    </div>

                    <label className="block text-xs text-slate-500 dark:text-slate-400">
                      备注（可选）
                      <input
                        name="note"
                        maxLength={300}
                        placeholder="例如：自动续费，可提前取消"
                        value={subForm.note}
                        onChange={(e) =>
                          setSubForm((prev) => ({ ...prev, note: e.target.value }))
                        }
                        className="mt-1 w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-blue-500"
                      />
                    </label>

                    <p className="text-[11px] text-slate-400 dark:text-slate-500 leading-relaxed">
                      按原始扣款锚点日滚动。到期后需由你手动确认已扣款才会生成支出账单。
                    </p>

                    {subError && (
                      <p id="subError" role="alert" className="text-xs text-rose-600 dark:text-rose-400">
                        {subError}
                      </p>
                    )}

                    <div className="flex items-center gap-2 pt-1">
                      <button
                        type="submit"
                        className="flex-1 py-2.5 px-4 rounded-xl text-xs font-semibold text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 transition-all flex items-center justify-center gap-1.5 shadow-sm"
                      >
                        <Check className="w-4 h-4" />
                        <span>{editSubId ? '更新订阅' : '保存订阅'}</span>
                      </button>
                      {editSubId && (
                        <button
                          id="cancelSub"
                          type="button"
                          onClick={resetSubForm}
                          className="py-2.5 px-3 rounded-xl text-xs font-medium text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800"
                        >
                          取消编辑
                        </button>
                      )}
                    </div>
                  </form>
                )}

                {/* 3. Reminder Form */}
                {activeEditor === 'reminder' && (
                  <form
                    id="reminder"
                    onSubmit={handleSubmitReminder}
                    noValidate
                    className="space-y-3"
                  >
                    <div className="flex items-center justify-between">
                      <h2
                        id="reminderTitle"
                        className="text-sm font-bold text-slate-900 dark:text-white"
                      >
                        {editReminderId ? '编辑生活提醒' : '添加生活提醒'}
                      </h2>
                      <Bell className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                    </div>

                    <label className="block text-xs text-slate-500 dark:text-slate-400">
                      提醒事项
                      <input
                        name="title"
                        maxLength={100}
                        placeholder="例如：喝药、交房租、取快递"
                        required
                        value={reminderForm.title}
                        onChange={(e) =>
                          setReminderForm((prev) => ({ ...prev, title: e.target.value }))
                        }
                        className="mt-1 w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-blue-500"
                      />
                    </label>

                    <label className="block text-xs text-slate-500 dark:text-slate-400">
                      提醒时间
                      <input
                        name="dueLocal"
                        type="datetime-local"
                        required
                        value={reminderForm.dueLocal}
                        onChange={(e) =>
                          setReminderForm((prev) => ({ ...prev, dueLocal: e.target.value }))
                        }
                        className="mt-1 w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-mono text-slate-900 dark:text-white focus:outline-none focus:border-blue-500"
                      />
                    </label>

                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        id="tomorrowMorning"
                        onClick={() => {
                          const d = new Date();
                          d.setDate(d.getDate() + 1);
                          d.setHours(8, 30, 0, 0);
                          setReminderForm((prev) => ({
                            ...prev,
                            dueLocal: dateToLocalInput(d),
                          }));
                        }}
                        className="py-1.5 px-2.5 rounded-xl text-xs font-medium bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                      >
                        明早 08:30
                      </button>
                      <button
                        type="button"
                        id="inTenMinutes"
                        onClick={() => {
                          const d = new Date(Date.now() + 600000);
                          setReminderForm((prev) => ({
                            ...prev,
                            dueLocal: dateToLocalInput(d),
                          }));
                        }}
                        className="py-1.5 px-2.5 rounded-xl text-xs font-medium bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                      >
                        十分钟后
                      </button>
                    </div>

                    <label className="block text-xs text-slate-500 dark:text-slate-400">
                      备注（可选）
                      <input
                        name="note"
                        maxLength={300}
                        placeholder="例如：饭后半小时，按医嘱服用"
                        value={reminderForm.note}
                        onChange={(e) =>
                          setReminderForm((prev) => ({ ...prev, note: e.target.value }))
                        }
                        className="mt-1 w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-blue-500"
                      />
                    </label>

                    <p id="reminderTimeHint" className="text-[11px] text-slate-400 dark:text-slate-500">
                      当前设备时区：{userTimezone} · 提醒不会产生账单。
                    </p>

                    {reminderError && (
                      <p
                        id="reminderError"
                        role="alert"
                        className="text-xs text-rose-600 dark:text-rose-400"
                      >
                        {reminderError}
                      </p>
                    )}

                    <div className="flex items-center gap-2 pt-1">
                      <button
                        type="submit"
                        className="flex-1 py-2.5 px-4 rounded-xl text-xs font-semibold text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 transition-all"
                      >
                        {editReminderId ? '更新提醒' : '保存提醒'}
                      </button>
                      {editReminderId && (
                        <button
                          type="button"
                          id="cancelReminder"
                          onClick={resetReminderForm}
                          className="py-2.5 px-3 rounded-xl text-xs font-medium text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800"
                        >
                          取消编辑
                        </button>
                      )}
                    </div>
                  </form>
                )}

                {/* 4. AI Natural Language Entry Form */}
                {activeEditor === 'ai' && (
                  <form id="aiEntry" onSubmit={handleAiParse} noValidate className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                        一句话智能解析
                      </h2>
                      <Sparkles className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                    </div>

                    <label className="block text-xs text-slate-500 dark:text-slate-400">
                      输入账单或周期订阅描述
                      <textarea
                        id="aiText"
                        rows={4}
                        maxLength={1000}
                        placeholder={`例如：今天午饭 23.5 元\n或：视频会员每月 25 元，下月 1 日扣款`}
                        required
                        value={aiText}
                        onChange={(e) => setAiText(e.target.value)}
                        className="mt-1.5 w-full p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-blue-500 leading-relaxed"
                      />
                    </label>

                    <div className="flex flex-wrap gap-1.5">
                      {[
                        '今天午饭 23.5 元',
                        '视频会员每月 25 元，下月 1 日扣款',
                        '打车去高铁站 42 元',
                        '发工资 15000 元',
                      ].map((ex) => (
                        <button
                          key={ex}
                          type="button"
                          onClick={() => setAiText(ex)}
                          className="px-2.5 py-1 rounded-lg text-[11px] bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-blue-50 dark:hover:bg-blue-950/40 hover:text-blue-600 transition-colors"
                        >
                          {ex}
                        </button>
                      ))}
                    </div>

                    <p className="text-[11px] text-slate-400 dark:text-slate-500 leading-relaxed">
                      智能解析仅生成待核对草稿并填入对应表单，不会直接入账，请核实金额与分类后保存。
                    </p>

                    {aiError && (
                      <p id="aiError" role="alert" className="text-xs text-rose-600 dark:text-rose-400">
                        {aiError}
                      </p>
                    )}

                    <button
                      id="aiParse"
                      type="submit"
                      disabled={aiLoading}
                      className="w-full py-2.5 px-4 rounded-xl text-xs font-semibold text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 transition-all flex items-center justify-center gap-1.5 shadow-sm"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      <span id="aiParseLabel">
                        {aiLoading ? 'AI 正在解析…' : '生成待核对草稿'}
                      </span>
                    </button>
                  </form>
                )}
              </aside>
            )}
          </div>
        </main>
      </div>
    </div>
  );
};
