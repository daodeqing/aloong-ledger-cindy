import {
  Bill,
  Subscription,
  Period,
  ScheduledReminder,
  MonthSummary,
  DailyStat,
  CategoryStat,
  BillKind,
  SubscriptionCycle,
  SubscriptionStatus,
  ReminderStatus,
} from './types';
import {
  validateAmount,
  validateDate,
  validateMonth,
  validateText,
  calculateNextDue,
  validateTimezone,
  validateReminderTime,
  generateId,
  getToday,
  formatMoney,
  formatCsvCell,
  fail,
} from './ledgerCore';
import { CATEGORIES, CATEGORY_MAP, getCategoryLabel } from './ledgerCategories';

interface StoredData {
  schemaVersion: number;
  bills: Bill[];
  subscriptions: Subscription[];
  periods: Period[];
  reminders: ScheduledReminder[];
  deletedRecords: Array<{ record_type: 'bills' | 'subscriptions'; record_id: string; deleted_at: string }>;
  drafts: Record<string, unknown>;
  revision: number;
}

const STORAGE_KEY = 'aloong_ledger_db_v1';

function getInitialData(): StoredData {
  const today = getToday();
  const [year, month] = today.split('-').map(Number);
  const pad = (n: number) => String(n).padStart(2, '0');
  const dStr = (day: number) => `${year}-${pad(month)}-${pad(day)}`;

  const sampleBills: Bill[] = [
    {
      id: generateId(),
      kind: 'expense',
      amount_cents: 3800,
      category: 'food',
      note: '午餐牛肉面加卤蛋',
      occurred_on: today,
      source: 'manual',
      revision: 1,
      created_at: new Date(Date.now() - 3600000 * 3).toISOString(),
    },
    {
      id: generateId(),
      kind: 'expense',
      amount_cents: 1800,
      category: 'transport',
      note: '地铁出行',
      occurred_on: today,
      source: 'manual',
      revision: 1,
      created_at: new Date(Date.now() - 3600000 * 6).toISOString(),
    },
    {
      id: generateId(),
      kind: 'expense',
      amount_cents: 12500,
      category: 'shopping',
      note: '日用消耗品补货',
      occurred_on: dStr(Math.max(1, new Date().getDate() - 1)),
      source: 'manual',
      revision: 1,
      created_at: new Date(Date.now() - 86400000).toISOString(),
    },
    {
      id: generateId(),
      kind: 'income',
      amount_cents: 1500000,
      category: 'salary',
      note: '月度基本薪酬',
      occurred_on: dStr(1),
      source: 'manual',
      revision: 1,
      created_at: new Date(Date.now() - 86400000 * 4).toISOString(),
    },
    {
      id: generateId(),
      kind: 'expense',
      amount_cents: 2500,
      category: 'digital',
      note: '视频平台包月会员',
      occurred_on: dStr(1),
      source: 'subscription',
      revision: 1,
      created_at: new Date(Date.now() - 86400000 * 4).toISOString(),
    },
    {
      id: generateId(),
      kind: 'expense',
      amount_cents: 6800,
      category: 'food',
      note: '周末聚餐',
      occurred_on: dStr(Math.max(1, new Date().getDate() - 2)),
      source: 'manual',
      revision: 1,
      created_at: new Date(Date.now() - 86400000 * 2).toISOString(),
    },
  ];

  const sub1Id = generateId();
  const sub2Id = generateId();
  const nextMonthFirst = calculateNextDue(`${year}-${pad(month)}-01`, 'monthly', 1);

  const sampleSubs: Subscription[] = [
    {
      id: sub1Id,
      name: '影音联合VIP会员',
      amount_cents: 2500,
      category: 'digital',
      note: '每月自动扣款，保留追剧特权',
      cycle: 'monthly',
      anchor_date: nextMonthFirst,
      period_index: 1,
      next_due: nextMonthFirst,
      status: 'active',
      revision: 1,
    },
    {
      id: sub2Id,
      name: '宽带高速服务',
      amount_cents: 9900,
      category: 'phone',
      note: '家庭千兆宽带年付月结',
      cycle: 'monthly',
      anchor_date: today,
      period_index: 0,
      next_due: today,
      status: 'active',
      revision: 1,
    },
  ];

  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Shanghai';
  const tomorrowMorning = new Date();
  tomorrowMorning.setDate(tomorrowMorning.getDate() + 1);
  tomorrowMorning.setHours(8, 30, 0, 0);

  const sampleReminders: ScheduledReminder[] = [
    {
      id: generateId(),
      title: '记得晨间按时服药',
      note: '饭后半小时，搭配温开水',
      due_at: tomorrowMorning.toISOString(),
      timezone: tz,
      status: 'active',
      delivery_state: 'pending',
      revision: 1,
      created_at: new Date().toISOString(),
    },
    {
      id: generateId(),
      title: '确认宽带扣款并核对账单',
      note: '月结日前检查优惠是否生效',
      due_at: new Date(Date.now() + 3600000 * 2).toISOString(),
      timezone: tz,
      status: 'active',
      delivery_state: 'pending',
      revision: 1,
      created_at: new Date().toISOString(),
    },
  ];

  return {
    schemaVersion: 2,
    bills: sampleBills,
    subscriptions: sampleSubs,
    periods: [],
    reminders: sampleReminders,
    deletedRecords: [],
    drafts: {},
    revision: 1,
  };
}

class LedgerStorage {
  private data: StoredData;

  constructor() {
    this.data = this.load();
  }

  private load(): StoredData {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.bills)) {
          return parsed;
        }
      }
    } catch (e) {
      console.warn('Failed to load ledger data from localStorage', e);
    }
    const initial = getInitialData();
    this.saveData(initial);
    return initial;
  }

  private saveData(data: StoredData) {
    this.data = data;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
      console.error('Failed to save ledger data', e);
    }
  }

  private mutate<T>(fn: (draft: StoredData) => T): T {
    const copy: StoredData = JSON.parse(JSON.stringify(this.data));
    const result = fn(copy);
    copy.revision += 1;
    this.saveData(copy);
    return result;
  }

  public getRevision(): number {
    return this.data.revision;
  }

  // --- Bills ---
  public recordBill(input: {
    kind: BillKind;
    amount: string | number;
    category: string;
    note?: string;
    occurredOn?: string;
    source?: 'manual' | 'subscription' | 'image' | 'ai';
  }): Bill {
    const cents = validateAmount(input.amount);
    const occurred_on = validateDate(input.occurredOn || getToday());
    const kind = input.kind === 'income' ? 'income' : 'expense';
    const cat = CATEGORY_MAP.get(input.category);
    if (!cat || cat.type !== kind) {
      fail('INVALID_CATEGORY', '分类与收支类型不匹配，请重新选择');
    }
    const note = validateText(input.note, '备注', 300, true);

    const bill: Bill = {
      id: generateId(),
      kind,
      amount_cents: cents,
      category: input.category,
      category_label: cat.label,
      note,
      occurred_on,
      source: input.source || 'manual',
      revision: 1,
      created_at: new Date().toISOString(),
    };

    return this.mutate((d) => {
      d.bills.unshift(bill);
      return bill;
    });
  }

  public editBill(
    id: string,
    input: {
      revision?: number;
      kind?: BillKind;
      amount?: string | number;
      category?: string;
      note?: string;
      occurredOn?: string;
      action?: 'edit' | 'delete' | 'restore';
    }
  ): Bill {
    return this.mutate((d) => {
      const bill = d.bills.find((b) => b.id === id);
      if (!bill) fail('NOT_FOUND', '账单记录不存在');

      const isDeleted = d.deletedRecords.some(
        (r) => r.record_type === 'bills' && r.record_id === id
      );

      const action = input.action || 'edit';
      if (action === 'delete') {
        if (isDeleted) fail('RECORD_DELETED', '记录已在回收站');
        d.deletedRecords.push({
          record_type: 'bills',
          record_id: id,
          deleted_at: new Date().toISOString(),
        });
        bill.revision += 1;
        return { ...bill, deleted: true };
      }

      if (action === 'restore') {
        if (!isDeleted) fail('NOT_DELETED', '记录不在回收站');
        d.deletedRecords = d.deletedRecords.filter(
          (r) => !(r.record_type === 'bills' && r.record_id === id)
        );
        bill.revision += 1;
        return { ...bill, deleted: false };
      }

      if (isDeleted) fail('RECORD_DELETED', '记录已在回收站，请先恢复');

      if (input.kind) bill.kind = input.kind;
      if (input.amount !== undefined) bill.amount_cents = validateAmount(input.amount);
      if (input.category) {
        const cat = CATEGORY_MAP.get(input.category);
        if (!cat || cat.type !== bill.kind) {
          fail('INVALID_CATEGORY', '分类与收支类型不匹配，请重新选择');
        }
        bill.category = input.category;
        bill.category_label = cat.label;
      }
      if (input.note !== undefined) bill.note = validateText(input.note, '备注', 300, true);
      if (input.occurredOn) bill.occurred_on = validateDate(input.occurredOn);
      bill.revision += 1;
      return bill;
    });
  }

  public queryBills(params: {
    from?: string;
    to?: string;
    category?: string;
    kind?: BillKind | 'all';
    query?: string;
    deletedOnly?: boolean;
    offset?: number;
    limit?: number;
  }): { items: Bill[]; total: number } {
    const deletedIds = new Set(
      this.data.deletedRecords
        .filter((r) => r.record_type === 'bills')
        .map((r) => r.record_id)
    );

    let list = this.data.bills.filter((b) =>
      params.deletedOnly ? deletedIds.has(b.id) : !deletedIds.has(b.id)
    );

    if (params.from) {
      list = list.filter((b) => b.occurred_on >= params.from!);
    }
    if (params.to) {
      list = list.filter((b) => b.occurred_on <= params.to!);
    }
    if (params.category) {
      list = list.filter((b) => b.category === params.category);
    }
    if (params.kind && params.kind !== 'all') {
      list = list.filter((b) => b.kind === params.kind);
    }
    if (params.query && params.query.trim()) {
      const q = params.query.trim().toLowerCase();
      list = list.filter((b) => {
        const label = getCategoryLabel(b.category).toLowerCase();
        const note = (b.note || '').toLowerCase();
        return label.includes(q) || note.includes(q) || b.occurred_on.includes(q);
      });
    }

    // Sort by occurred_on desc, created_at desc
    list.sort((a, b) => {
      if (a.occurred_on !== b.occurred_on) return b.occurred_on.localeCompare(a.occurred_on);
      return b.created_at.localeCompare(a.created_at);
    });

    const total = list.length;
    const offset = Math.max(0, params.offset || 0);
    const limit = params.limit || 20;
    const items = list.slice(offset, offset + limit).map((b) => ({
      ...b,
      category_label: getCategoryLabel(b.category),
      deleted: deletedIds.has(b.id),
    }));

    return { items, total };
  }

  // --- Subscriptions ---
  public createSubscription(input: {
    name: string;
    amount: string | number;
    category: string;
    note?: string;
    cycle: SubscriptionCycle;
    nextDue: string;
  }): Subscription {
    const name = validateText(input.name, '订阅名称', 80);
    const cents = validateAmount(input.amount);
    const cat = CATEGORY_MAP.get(input.category);
    if (!cat || cat.type !== 'expense') {
      fail('INVALID_CATEGORY', '订阅只能使用支出分类');
    }
    if (!['weekly', 'monthly', 'yearly'].includes(input.cycle)) {
      fail('INVALID_CYCLE', '请选择每周、每月或每年');
    }
    const next_due = validateDate(input.nextDue);
    const note = validateText(input.note, '备注', 300, true);

    const sub: Subscription = {
      id: generateId(),
      name,
      amount_cents: cents,
      category: input.category,
      category_label: cat.label,
      note,
      cycle: input.cycle,
      anchor_date: next_due,
      period_index: 0,
      next_due,
      status: 'active',
      revision: 1,
    };

    return this.mutate((d) => {
      d.subscriptions.unshift(sub);
      return sub;
    });
  }

  public updateSubscription(
    id: string,
    input: {
      revision?: number;
      name?: string;
      note?: string;
      amount?: string | number;
      category?: string;
      cycle?: SubscriptionCycle;
      nextDue?: string;
      status?: SubscriptionStatus;
      action?: 'update' | 'delete' | 'restore';
    }
  ): Subscription {
    return this.mutate((d) => {
      const sub = d.subscriptions.find((s) => s.id === id);
      if (!sub) fail('NOT_FOUND', '订阅不存在');

      const isDeleted = d.deletedRecords.some(
        (r) => r.record_type === 'subscriptions' && r.record_id === id
      );

      const action = input.action || 'update';
      if (action === 'delete') {
        if (isDeleted) fail('RECORD_DELETED', '记录已在回收站');
        d.deletedRecords.push({
          record_type: 'subscriptions',
          record_id: id,
          deleted_at: new Date().toISOString(),
        });
        sub.revision += 1;
        return { ...sub, deleted: true };
      }

      if (action === 'restore') {
        if (!isDeleted) fail('NOT_DELETED', '记录不在回收站');
        d.deletedRecords = d.deletedRecords.filter(
          (r) => !(r.record_type === 'subscriptions' && r.record_id === id)
        );
        sub.revision += 1;
        return { ...sub, deleted: false };
      }

      if (isDeleted) fail('RECORD_DELETED', '记录已在回收站，请先恢复');

      if (input.name !== undefined) sub.name = validateText(input.name, '名称', 80);
      if (input.note !== undefined) sub.note = validateText(input.note, '备注', 300, true);
      if (input.amount !== undefined) sub.amount_cents = validateAmount(input.amount);
      if (input.category) {
        const cat = CATEGORY_MAP.get(input.category);
        if (!cat || cat.type !== 'expense') fail('INVALID_CATEGORY', '订阅分类须为支出');
        sub.category = input.category;
        sub.category_label = cat.label;
      }
      if (input.status) sub.status = input.status;

      if (
        (input.nextDue && input.nextDue !== sub.next_due) ||
        (input.cycle && input.cycle !== sub.cycle)
      ) {
        sub.anchor_date = validateDate(input.nextDue || sub.next_due);
        sub.period_index = 0;
        sub.next_due = sub.anchor_date;
        if (input.cycle) sub.cycle = input.cycle;
      }

      sub.revision += 1;
      return sub;
    });
  }

  public confirmSubscriptionCharge(
    id: string,
    periodKey: string,
    occurredOn?: string
  ): { action: string; billId: string; periodKey: string; nextDue: string } {
    return this.mutate((d) => {
      const sub = d.subscriptions.find((s) => s.id === id);
      if (!sub) fail('NOT_FOUND', '订阅不存在');
      const isDeleted = d.deletedRecords.some(
        (r) => r.record_type === 'subscriptions' && r.record_id === id
      );
      if (isDeleted) fail('RECORD_DELETED', '订阅已在回收站');
      if (sub.status !== 'active') fail('INACTIVE_SUBSCRIPTION', '订阅已暂停或归档，请先启用');

      const expectedKey = `${sub.id}:${sub.next_due}`;
      if (periodKey !== expectedKey) {
        const prior = d.periods.find((p) => p.period_key === periodKey);
        if (prior) return { action: prior.action, billId: prior.bill_id || '', periodKey, nextDue: sub.next_due };
        fail('STALE_PERIOD', '到期周期已改变，请刷新后操作');
      }

      const today = getToday();
      if (sub.next_due > today) {
        fail('NOT_DUE', '此订阅尚未到期，请到期后确认');
      }

      const billId = generateId();
      const nextIndex = sub.period_index + 1;
      const nextDate = calculateNextDue(sub.anchor_date, sub.cycle, nextIndex);

      d.periods.push({
        period_key: periodKey,
        subscription_id: sub.id,
        due_on: sub.next_due,
        action: 'confirmed',
        bill_id: billId,
        processed_on: today,
      });

      const bill: Bill = {
        id: billId,
        kind: 'expense',
        amount_cents: sub.amount_cents,
        category: sub.category,
        category_label: getCategoryLabel(sub.category),
        note: sub.name + (sub.note ? ` · ${sub.note}` : ''),
        occurred_on: validateDate(occurredOn || sub.next_due),
        source: 'subscription',
        subscription_id: sub.id,
        period_key: periodKey,
        revision: 1,
        created_at: new Date().toISOString(),
      };
      d.bills.unshift(bill);

      sub.period_index = nextIndex;
      sub.next_due = nextDate;
      sub.revision += 1;

      return { action: 'confirmed', billId, periodKey, nextDue: nextDate };
    });
  }

  public skipSubscriptionPeriod(
    id: string,
    periodKey: string
  ): { action: string; periodKey: string; nextDue: string } {
    return this.mutate((d) => {
      const sub = d.subscriptions.find((s) => s.id === id);
      if (!sub) fail('NOT_FOUND', '订阅不存在');
      const isDeleted = d.deletedRecords.some(
        (r) => r.record_type === 'subscriptions' && r.record_id === id
      );
      if (isDeleted) fail('RECORD_DELETED', '订阅已在回收站');
      if (sub.status !== 'active') fail('INACTIVE_SUBSCRIPTION', '订阅已暂停或归档，请先启用');

      const expectedKey = `${sub.id}:${sub.next_due}`;
      if (periodKey !== expectedKey) {
        const prior = d.periods.find((p) => p.period_key === periodKey);
        if (prior) return { action: prior.action, periodKey, nextDue: sub.next_due };
        fail('STALE_PERIOD', '到期周期已改变，请刷新后操作');
      }

      const today = getToday();
      if (sub.next_due > today) {
        fail('NOT_DUE', '此订阅尚未到期，请到期后确认');
      }

      const nextIndex = sub.period_index + 1;
      const nextDate = calculateNextDue(sub.anchor_date, sub.cycle, nextIndex);

      d.periods.push({
        period_key: periodKey,
        subscription_id: sub.id,
        due_on: sub.next_due,
        action: 'skipped',
        bill_id: null,
        processed_on: today,
      });

      sub.period_index = nextIndex;
      sub.next_due = nextDate;
      sub.revision += 1;

      return { action: 'skipped', periodKey, nextDue: nextDate };
    });
  }

  public listSubscriptions(params: {
    status?: SubscriptionStatus | 'all' | 'due';
    deletedOnly?: boolean;
    offset?: number;
    limit?: number;
  }): { items: Subscription[]; total: number } {
    const deletedIds = new Set(
      this.data.deletedRecords
        .filter((r) => r.record_type === 'subscriptions')
        .map((r) => r.record_id)
    );

    let list = this.data.subscriptions.filter((s) =>
      params.deletedOnly ? deletedIds.has(s.id) : !deletedIds.has(s.id)
    );

    const today = getToday();
    if (params.status === 'due') {
      list = list.filter((s) => s.status === 'active' && s.next_due <= today);
    } else if (params.status && params.status !== 'all') {
      list = list.filter((s) => s.status === params.status);
    }

    list.sort((a, b) => a.next_due.localeCompare(b.next_due));

    const total = list.length;
    const offset = Math.max(0, params.offset || 0);
    const limit = params.limit || 20;
    const items = list.slice(offset, offset + limit).map((s) => ({
      ...s,
      category_label: getCategoryLabel(s.category),
      deleted: deletedIds.has(s.id),
      period_key: `${s.id}:${s.next_due}`,
    }));

    return { items, total };
  }

  public getDueItems(): { items: Subscription[]; total: number } {
    return this.listSubscriptions({ status: 'due' });
  }

  // --- Scheduled Reminders ---
  public createReminder(input: {
    title: string;
    note?: string;
    dueAt: string;
    timezone?: string;
  }): ScheduledReminder {
    const title = validateText(input.title, '提醒内容', 100);
    const note = validateText(input.note, '备注', 300, true);
    const tz = validateTimezone(
      input.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Shanghai'
    );
    const due_at = validateReminderTime(input.dueAt);

    const reminder: ScheduledReminder = {
      id: generateId(),
      title,
      note,
      due_at,
      timezone: tz,
      status: 'active',
      delivery_state: 'pending',
      revision: 1,
      created_at: new Date().toISOString(),
    };

    return this.mutate((d) => {
      d.reminders.unshift(reminder);
      return reminder;
    });
  }

  public updateReminder(
    id: string,
    input: {
      revision?: number;
      title?: string;
      note?: string;
      dueAt?: string;
      timezone?: string;
      status?: ReminderStatus;
    }
  ): ScheduledReminder {
    return this.mutate((d) => {
      const rem = d.reminders.find((r) => r.id === id);
      if (!rem) fail('NOT_FOUND', '提醒不存在');

      if (input.title !== undefined) rem.title = validateText(input.title, '提醒内容', 100);
      if (input.note !== undefined) rem.note = validateText(input.note, '备注', 300, true);
      if (input.status) {
        if (!['active', 'completed', 'cancelled'].includes(input.status)) {
          fail('INVALID_INPUT', '提醒状态无效');
        }
        if (input.status === 'active' && rem.status !== 'active' && !input.dueAt) {
          fail('NEW_TIME_REQUIRED', '恢复提醒需要选择新的提醒时间');
        }
        rem.status = input.status;
      }
      if (input.dueAt) {
        rem.due_at = validateReminderTime(input.dueAt);
        rem.delivery_state = 'pending';
        rem.attempt_at = null;
        rem.notified_at = null;
        rem.delivery_error = '';
      }
      if (input.timezone) rem.timezone = validateTimezone(input.timezone);

      rem.revision += 1;
      return rem;
    });
  }

  public listReminders(params: {
    status?: ReminderStatus | 'all';
    offset?: number;
    limit?: number;
  }): { items: ScheduledReminder[]; total: number } {
    let list = this.data.reminders;
    if (params.status && params.status !== 'all') {
      list = list.filter((r) => r.status === params.status);
    }

    list.sort((a, b) => {
      if (a.status !== b.status) return a.status === 'active' ? -1 : 1;
      return a.due_at.localeCompare(b.due_at);
    });

    const total = list.length;
    const offset = Math.max(0, params.offset || 0);
    const limit = params.limit || 20;

    return {
      items: list.slice(offset, offset + limit),
      total,
    };
  }

  // --- Summary & Dashboard ---
  public getSummary(requestedMonth?: string): MonthSummary {
    const today = getToday();
    const month = validateMonth(requestedMonth || today.slice(0, 7));
    const from = `${month}-01`;
    const to = calculateNextDue(from, 'monthly', 1);

    const deletedBillIds = new Set(
      this.data.deletedRecords.filter((r) => r.record_type === 'bills').map((r) => r.record_id)
    );
    const activeBills = this.data.bills.filter(
      (b) => !deletedBillIds.has(b.id) && b.occurred_on >= from && b.occurred_on < to
    );

    let income_cents = 0;
    let expense_cents = 0;
    const catMap = new Map<string, { kind: BillKind; category: string; cents: number; count: number }>();

    for (const b of activeBills) {
      if (b.kind === 'income') {
        income_cents += b.amount_cents;
      } else {
        expense_cents += b.amount_cents;
      }

      const key = `${b.kind}:${b.category}`;
      const existing = catMap.get(key) || { kind: b.kind, category: b.category, cents: 0, count: 0 };
      existing.cents += b.amount_cents;
      existing.count += 1;
      catMap.set(key, existing);
    }

    const categories: CategoryStat[] = Array.from(catMap.values())
      .map((c) => ({
        ...c,
        label: getCategoryLabel(c.category),
      }))
      .sort((a, b) => b.cents - a.cents);

    // Days in this month
    const [y, m] = month.split('-').map(Number);
    const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const daily: DailyStat[] = Array.from({ length: daysInMonth }, (_, i) => ({
      date: `${month}-${String(i + 1).padStart(2, '0')}`,
      income_cents: 0,
      expense_cents: 0,
    }));

    for (const b of activeBills) {
      const dayNum = Number(b.occurred_on.slice(-2));
      if (dayNum >= 1 && dayNum <= daysInMonth) {
        if (b.kind === 'income') {
          daily[dayNum - 1].income_cents += b.amount_cents;
        } else {
          daily[dayNum - 1].expense_cents += b.amount_cents;
        }
      }
    }

    // Previous month comparison
    const prevDate = new Date(`${from}T00:00:00Z`);
    prevDate.setUTCMonth(prevDate.getUTCMonth() - 1);
    const prevFrom = prevDate.toISOString().slice(0, 10);
    const prevBills = this.data.bills.filter(
      (b) =>
        !deletedBillIds.has(b.id) &&
        b.kind === 'expense' &&
        b.occurred_on >= prevFrom &&
        b.occurred_on < from
    );
    const previous_expense_cents = prevBills.reduce((s, b) => s + b.amount_cents, 0);

    const max_expense_cents = activeBills
      .filter((b) => b.kind === 'expense')
      .reduce((max, b) => Math.max(max, b.amount_cents), 0);

    const elapsedDays = month === today.slice(0, 7) ? Math.max(1, Number(today.slice(-2))) : daysInMonth;
    const daily_average_cents = Math.round(expense_cents / elapsedDays);

    // Subscriptions count & estimated monthly
    const deletedSubIds = new Set(
      this.data.deletedRecords
        .filter((r) => r.record_type === 'subscriptions')
        .map((r) => r.record_id)
    );
    const activeSubs = this.data.subscriptions.filter(
      (s) => !deletedSubIds.has(s.id) && s.status === 'active'
    );
    const activeCount = activeSubs.length;
    let estimatedMonthly = 0;
    let nextDueSub: string | null = null;

    for (const s of activeSubs) {
      if (s.cycle === 'monthly') estimatedMonthly += s.amount_cents;
      else if (s.cycle === 'yearly') estimatedMonthly += s.amount_cents / 12;
      else estimatedMonthly += (s.amount_cents * 52) / 12;

      if (!nextDueSub || s.next_due < nextDueSub) {
        nextDueSub = s.next_due;
      }
    }

    return {
      month,
      currency: 'CNY',
      income_cents,
      expense_cents,
      net_cents: income_cents - expense_cents,
      bill_count: activeBills.length,
      daily_average_cents,
      max_expense_cents,
      previous_expense_cents,
      daily,
      subscriptions: {
        active_count: activeCount,
        estimated_monthly_cents: Math.round(estimatedMonthly),
        next_due: nextDueSub,
      },
      categories,
    };
  }

  // --- Draft Management ---
  public getDraft(clientId: string): Record<string, unknown> {
    return (this.data.drafts[clientId] as Record<string, unknown>) || {};
  }

  public saveDraft(clientId: string, value: unknown) {
    this.mutate((d) => {
      d.drafts[clientId] = value;
      return true;
    });
  }

  // --- Export ---
  public exportJson(): string {
    return JSON.stringify(
      {
        schemaVersion: this.data.schemaVersion,
        currency: 'CNY',
        exportedAt: new Date().toISOString(),
        bills: this.data.bills,
        subscriptions: this.data.subscriptions,
        periods: this.data.periods,
        reminders: this.data.reminders,
        deleted_records: this.data.deletedRecords,
      },
      null,
      2
    );
  }

  public exportCsv(): string {
    const deletedBillIds = new Set(
      this.data.deletedRecords.filter((r) => r.record_type === 'bills').map((r) => r.record_id)
    );
    const bills = this.data.bills.filter((b) => !deletedBillIds.has(b.id));

    const rows = [
      ['日期', '收支', '金额分', '币种', '分类', '备注', '账单标识', '订阅标识', '周期键'],
      ...bills.map((b) => [
        b.occurred_on,
        b.kind === 'income' ? '收入' : '支出',
        b.amount_cents,
        'CNY',
        getCategoryLabel(b.category),
        b.note,
        b.id,
        b.subscription_id || '',
        b.period_key || '',
      ]),
    ];

    return '\uFEFF' + rows.map((r) => r.map(formatCsvCell).join(',')).join('\r\n');
  }
}

export const ledgerStorage = new LedgerStorage();


if (typeof window !== 'undefined') {
  try {
    const ch = new BroadcastChannel('liang-ledger');
    ch.onmessage = (e) => {
      if (e.data && e.data.type === 'ledger-changed') {
        window.dispatchEvent(new CustomEvent('ledger-sync-requested'));
      }
    };
    (window as any).notifyLedgerChanged = () => {
      try { ch.postMessage({ type: 'ledger-changed' }); } catch {}
    };
  } catch (err) {
    console.warn('BroadcastChannel initialization skipped:', err);
  }
}
