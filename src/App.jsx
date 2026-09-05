import React, { useState, useEffect, useRef } from 'react';
import {
  Upload, X, Plus, Check, Trash2, Pencil, AlertCircle, Loader2, Settings,
  Home, Building2, Zap, Wifi, UtensilsCrossed, Tv, Car, Heart,
  Dumbbell, GraduationCap, Smartphone, ShoppingCart, Landmark, Wallet,
} from 'lucide-react';
import { supabase } from './supabaseClient';

const MONTHS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
const MONTHS_FULL = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

const ICON_LIBRARY = {
  Home, Building2, Zap, Wifi, UtensilsCrossed, Tv, Car, Heart,
  Dumbbell, GraduationCap, Smartphone, ShoppingCart, Landmark, Wallet,
};
const ICON_KEYS = Object.keys(ICON_LIBRARY);

// Espaços disponíveis: conta conjunta do casal + uma área pessoal para cada pessoa
const SPACES = ['joint', 'p1', 'p2'];

const DEFAULT_FIXED_JOINT = [
  { id: 'fx-aluguel', name: 'Aluguel', amount: 1500, icon: 'Home' },
  { id: 'fx-streaming', name: 'Streamings', amount: 60, icon: 'Tv' },
  { id: 'fx-luz', name: 'Luz', amount: 180, icon: 'Zap' },
  { id: 'fx-internet', name: 'Internet', amount: 100, icon: 'Wifi' },
  { id: 'fx-alimentacao', name: 'Alimentação', amount: 600, icon: 'UtensilsCrossed' },
];
// Gastos fixos agora são um objeto por espaço: joint (casa) / p1 / p2 (pessoais)
const DEFAULT_FIXED_TEMPLATES = { joint: DEFAULT_FIXED_JOINT, p1: [], p2: [] };

const DEFAULT_INVESTMENTS = { balance: 0, goalName: 'Entrada do apartamento', goalAmount: 50000, contributions: {} };

// Nomes exibidos nas abas pessoais — editáveis pelo ícone de engrenagem no app
const DEFAULT_SETTINGS = { p1Name: 'Pessoa 1', p2Name: 'Pessoa 2' };

function brl(v) {
  const n = Number(v) || 0;
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
function monthKey(year, idx) {
  return `${year}-${String(idx + 1).padStart(2, '0')}`;
}
function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}
function parseAmount(raw) {
  return Number(String(raw).replace(',', '.'));
}
// Aceita tanto o formato antigo (array simples) quanto o novo (objeto por espaço),
// pra não quebrar caso o código novo suba antes da migração do banco (ou vice-versa).
function normalizeFixedTemplates(raw) {
  if (Array.isArray(raw)) {
    return { joint: raw, p1: [], p2: [] };
  }
  if (raw && typeof raw === 'object') {
    return { joint: raw.joint || [], p1: raw.p1 || [], p2: raw.p2 || [] };
  }
  return { joint: [], p1: [], p2: [] };
}

export default function App() {
  const now = new Date();
  const year = now.getFullYear();

  const [selectedMonthIdx, setSelectedMonthIdx] = useState(now.getMonth());
  const [activeTab, setActiveTab] = useState('lancamentos');
  const [space, setSpace] = useState('joint');
  const [loading, setLoading] = useState(true);
  const [saveError, setSaveError] = useState(null);

  const [fixedTemplates, setFixedTemplates] = useState(DEFAULT_FIXED_TEMPLATES);
  const [paidStatus, setPaidStatus] = useState({});
  const [transactions, setTransactions] = useState({});
  const [investments, setInvestments] = useState(DEFAULT_INVESTMENTS);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);

  const [showSummary, setShowSummary] = useState(false);
  const [showTxModal, setShowTxModal] = useState(false);
  const [showFixedModal, setShowFixedModal] = useState(false);
  const [showNamesModal, setShowNamesModal] = useState(false);
  const [editingFixed, setEditingFixed] = useState(null);
  const [lightboxImage, setLightboxImage] = useState(null);

  async function loadTransactions() {
    if (!supabase) return;
    const { data, error } = await supabase.from('transactions').select('*').order('date', { ascending: false });
    if (error) { setSaveError('Não foi possível carregar os lançamentos.'); return; }
    const grouped = {};
    (data || []).forEach((t) => {
      grouped[t.month_key] = grouped[t.month_key] || [];
      grouped[t.month_key].push({
        id: t.id, amount: Number(t.amount), description: t.description, date: t.date, image: t.image_url,
        space: t.space || 'joint',
      });
    });
    setTransactions(grouped);
  }

  // Carrega os dados do Supabase ao abrir o app
  useEffect(() => {
    if (!supabase) { setLoading(false); return; }
    let cancelled = false;
    (async () => {
      try {
        let { data } = await supabase.from('app_state').select('*').eq('id', 1).maybeSingle();
        if (!data) {
          const { data: inserted } = await supabase
            .from('app_state')
            .insert({
              id: 1,
              fixed_templates: DEFAULT_FIXED_TEMPLATES,
              paid_status: {},
              investments: DEFAULT_INVESTMENTS,
              settings: DEFAULT_SETTINGS,
            })
            .select()
            .single();
          data = inserted;
        }
        if (!cancelled && data) {
          setFixedTemplates(normalizeFixedTemplates(data.fixed_templates));
          setPaidStatus(data.paid_status || {});
          setInvestments(data.investments || DEFAULT_INVESTMENTS);
          setSettings(data.settings || DEFAULT_SETTINGS);
        }
        await loadTransactions();
      } catch (err) {
        if (!cancelled) setSaveError('Não foi possível conectar ao Supabase. Confira as chaves no arquivo .env.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Mantém os dois celulares sincronizados em tempo real
  useEffect(() => {
    if (!supabase) return;
    const channel = supabase
      .channel('alicerce-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'transactions' }, () => {
        loadTransactions();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'app_state' }, (payload) => {
        if (payload.new) {
          setFixedTemplates(normalizeFixedTemplates(payload.new.fixed_templates));
          setPaidStatus(payload.new.paid_status || {});
          setInvestments(payload.new.investments || DEFAULT_INVESTMENTS);
          setSettings(payload.new.settings || DEFAULT_SETTINGS);
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  // Salva gastos fixos / status de pagamento / investimentos / nomes no Supabase a cada alteração
  useEffect(() => {
    if (loading || !supabase) return;
    (async () => {
      const { error } = await supabase
        .from('app_state')
        .update({
          fixed_templates: fixedTemplates,
          paid_status: paidStatus,
          investments,
          settings,
          updated_at: new Date().toISOString(),
        })
        .eq('id', 1);
      setSaveError(error ? 'Não foi possível salvar suas alterações agora.' : null);
    })();
  }, [fixedTemplates, paidStatus, investments, settings, loading]);

  const mk = monthKey(year, selectedMonthIdx);
  const currentFixed = fixedTemplates[space] || [];
  const fixedTotal = currentFixed.reduce((s, f) => s + (Number(f.amount) || 0), 0);
  const fixedPaidTotal = currentFixed.reduce(
    (s, f) => s + (((paidStatus[mk] || {})[f.id]) ? (Number(f.amount) || 0) : 0),
    0
  );
  const fixedPendingTotal = fixedTotal - fixedPaidTotal;
  const monthTransactions = (transactions[mk] || []).filter((t) => t.space === space);
  const variableTotal = monthTransactions.reduce((s, t) => s + (Number(t.amount) || 0), 0);
  const contribution = (investments.contributions || {})[mk] || 0;

  function hasData(idx) {
    const k = monthKey(year, idx);
    const hasSpaceTx = (transactions[k] || []).some((t) => t.space === space);
    return hasSpaceTx || !!(investments.contributions || {})[k];
  }

  async function handleAddTransaction(tx, file) {
    let imageUrl = null;
    if (file) {
      const path = `${mk}/${uid()}-${file.name}`.replace(/\s+/g, '-');
      const { error: upErr } = await supabase.storage.from('receipts').upload(path, file);
      if (upErr) { setSaveError('Não foi possível enviar a imagem do comprovante.'); return; }
      const { data: urlData } = supabase.storage.from('receipts').getPublicUrl(path);
      imageUrl = urlData.publicUrl;
    }
    const { error } = await supabase.from('transactions').insert({
      month_key: mk, amount: tx.amount, description: tx.description, date: tx.date, image_url: imageUrl, space,
    });
    if (error) { setSaveError('Não foi possível salvar o lançamento.'); return; }
    setShowTxModal(false);
    loadTransactions();
  }

  async function handleDeleteTransaction(id) {
    const { error } = await supabase.from('transactions').delete().eq('id', id);
    if (error) { setSaveError('Não foi possível excluir o lançamento.'); return; }
    loadTransactions();
  }

  if (!supabase) return <ConfigMissingScreen />;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      {loading ? (
        <LoadingScreen />
      ) : (
        <>
          <Header balance={investments.balance} />

          <SpaceSwitcher
            space={space}
            onChange={setSpace}
            p1Name={settings.p1Name}
            p2Name={settings.p2Name}
            onOpenSettings={() => setShowNamesModal(true)}
          />

          <MonthStrip
            selectedIdx={selectedMonthIdx}
            onSelect={(idx) => { setSelectedMonthIdx(idx); setShowSummary(true); }}
            hasData={hasData}
          />

          <TabBar active={activeTab} onChange={setActiveTab} />

          <main className="mx-auto max-w-3xl px-4 pb-24 pt-6 sm:px-6">
            <h2 className="font-display mb-5 text-xl text-slate-900">
              {MONTHS_FULL[selectedMonthIdx]} de {year}
            </h2>

            {activeTab === 'lancamentos' && (
              <TransactionsTab
                items={monthTransactions}
                total={variableTotal}
                onAdd={() => setShowTxModal(true)}
                onDelete={handleDeleteTransaction}
                onViewImage={setLightboxImage}
              />
            )}

            {activeTab === 'fixos' && (
              <FixedExpensesTab
                items={currentFixed}
                paid={paidStatus[mk] || {}}
                onToggle={(id) =>
                  setPaidStatus((prev) => ({
                    ...prev,
                    [mk]: { ...(prev[mk] || {}), [id]: !(prev[mk] && prev[mk][id]) },
                  }))
                }
                onAdd={() => { setEditingFixed(null); setShowFixedModal(true); }}
                onEdit={(f) => { setEditingFixed(f); setShowFixedModal(true); }}
                onDelete={(id) => {
                  setFixedTemplates((prev) => ({ ...prev, [space]: prev[space].filter((f) => f.id !== id) }));
                  setPaidStatus((prev) => {
                    const next = {};
                    Object.keys(prev).forEach((k) => {
                      const { [id]: _drop, ...rest } = prev[k] || {};
                      next[k] = rest;
                    });
                    return next;
                  });
                }}
                total={fixedTotal}
                paidTotal={fixedPaidTotal}
                pendingTotal={fixedPendingTotal}
              />
            )}

            {activeTab === 'investimentos' && (
              <InvestmentsTab
                investments={investments}
                contribution={contribution}
                monthKeyStr={mk}
                onSetBalance={(v) => setInvestments((prev) => ({ ...prev, balance: v }))}
                onSetContribution={(k, v) =>
                  setInvestments((prev) => ({ ...prev, contributions: { ...(prev.contributions || {}), [k]: v } }))
                }
                onSetGoal={(name, amount) =>
                  setInvestments((prev) => ({ ...prev, goalName: name, goalAmount: amount }))
                }
              />
            )}
          </main>

          {showSummary && (
            <SummaryDrawer
              monthLabel={MONTHS_FULL[selectedMonthIdx]}
              fixedTotal={fixedTotal}
              variableTotal={variableTotal}
              contribution={contribution}
              onClose={() => setShowSummary(false)}
            />
          )}

          {showTxModal && <TransactionModal onClose={() => setShowTxModal(false)} onSave={handleAddTransaction} />}

          {showFixedModal && (
            <FixedExpenseModal
              editing={editingFixed}
              onClose={() => setShowFixedModal(false)}
              onSave={(data) => {
                if (editingFixed) {
                  setFixedTemplates((prev) => ({
                    ...prev,
                    [space]: prev[space].map((f) => (f.id === editingFixed.id ? { ...f, ...data } : f)),
                  }));
                } else {
                  setFixedTemplates((prev) => ({ ...prev, [space]: [...prev[space], { ...data, id: uid() }] }));
                }
                setShowFixedModal(false);
              }}
            />
          )}

          {showNamesModal && (
            <NamesModal
              p1Name={settings.p1Name}
              p2Name={settings.p2Name}
              onClose={() => setShowNamesModal(false)}
              onSave={(p1Name, p2Name) => setSettings({ p1Name, p2Name })}
            />
          )}

          {lightboxImage && <ImageLightbox src={lightboxImage} onClose={() => setLightboxImage(null)} />}
          {saveError && <ErrorToast message={saveError} onDismiss={() => setSaveError(null)} />}
        </>
      )}
    </div>
  );
}

function ConfigMissingScreen() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6 text-center">
      <div className="max-w-sm">
        <h1 className="font-display mb-2 text-xl font-semibold text-slate-900">Configuração pendente</h1>
        <p className="text-sm text-slate-500">
          Defina as variáveis VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY (no arquivo .env local ou nas variáveis de
          ambiente do seu provedor de deploy) e recarregue a página.
        </p>
      </div>
    </div>
  );
}

function LoadingScreen() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="flex items-center gap-3 text-slate-500">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span>Carregando seus dados...</span>
      </div>
    </div>
  );
}

function Header({ balance }) {
  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-5 sm:px-6">
        <div>
          <h1 className="font-display text-2xl font-semibold text-slate-900">Alicerce</h1>
          <p className="text-sm text-slate-500">seu progresso financeiro, mês a mês</p>
        </div>
        <div className="text-right">
          <p className="text-sm text-slate-500">reserva atual</p>
          <p className="font-display text-xl font-semibold text-amber-700">{brl(balance)}</p>
        </div>
      </div>
    </header>
  );
}

// Seletor de espaço: conta conjunta do casal, ou a área pessoal de cada uma.
// Filtra Lançamentos e Gastos Fixos; Investimentos continua sempre conjunto.
function SpaceSwitcher({ space, onChange, p1Name, p2Name, onOpenSettings }) {
  const spaces = [
    { id: 'joint', label: 'Conjunta' },
    { id: 'p1', label: p1Name },
    { id: 'p2', label: p2Name },
  ];
  return (
    <div className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-3xl items-center gap-2 px-4 py-3 sm:px-6">
        <div className="flex flex-1 gap-1.5">
          {spaces.map((s) => (
            <button
              key={s.id}
              onClick={() => onChange(s.id)}
              className={`flex-1 truncate rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                space === s.id ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-slate-700'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
        <button
          onClick={onOpenSettings}
          aria-label="Editar nomes das abas pessoais"
          className="shrink-0 rounded-full p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
        >
          <Settings className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function NamesModal({ p1Name, p2Name, onClose, onSave }) {
  const [n1, setN1] = useState(p1Name);
  const [n2, setN2] = useState(p2Name);
  return (
    <Modal title="Nomes das abas pessoais" onClose={onClose}>
      <div className="space-y-4">
        <div>
          <label className="mb-1.5 block text-sm text-slate-600">Nome da pessoa 1</label>
          <input
            value={n1}
            onChange={(e) => setN1(e.target.value)}
            placeholder="Pessoa 1"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-slate-500"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-sm text-slate-600">Nome da pessoa 2</label>
          <input
            value={n2}
            onChange={(e) => setN2(e.target.value)}
            placeholder="Pessoa 2"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-slate-500"
          />
        </div>
        <div className="flex gap-3 pt-2">
          <button onClick={onClose} className="flex-1 rounded-lg border border-slate-300 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50">
            Cancelar
          </button>
          <button
            onClick={() => { onSave(n1.trim() || 'Pessoa 1', n2.trim() || 'Pessoa 2'); onClose(); }}
            className="flex-1 rounded-lg bg-slate-900 py-2.5 text-sm font-medium text-white hover:bg-slate-800"
          >
            Salvar
          </button>
        </div>
      </div>
    </Modal>
  );
}

function MonthStrip({ selectedIdx, onSelect, hasData }) {
  return (
    <div className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-3xl gap-1 overflow-x-auto px-4 py-3 sm:px-6">
        {MONTHS.map((m, idx) => {
          const active = idx === selectedIdx;
          return (
            <button
              key={m}
              onClick={() => onSelect(idx)}
              className={`relative shrink-0 rounded-lg px-3 py-2 text-sm transition-colors ${
                active ? 'bg-slate-900 text-white' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'
              }`}
            >
              {m}
              {hasData(idx) && !active && (
                <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-amber-500" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function TabBar({ active, onChange }) {
  const tabs = [
    { id: 'lancamentos', label: 'Lançamentos' },
    { id: 'fixos', label: 'Gastos fixos' },
    { id: 'investimentos', label: 'Investimentos' },
  ];
  return (
    <div className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-3xl px-4 sm:px-6">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => onChange(t.id)}
            className={`flex-1 border-b-2 px-2 py-3 text-sm font-medium transition-colors sm:flex-none sm:px-4 ${
              active === t.id ? 'border-slate-900 text-slate-900' : 'border-transparent text-slate-400 hover:text-slate-600'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function Modal({ title, onClose, children, wide }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4" onClick={onClose}>
      <div
        className={`w-full ${wide ? 'max-w-lg' : 'max-w-md'} overflow-y-auto rounded-2xl bg-white p-6 shadow-xl`}
        style={{ maxHeight: '90vh' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-display text-lg font-semibold text-slate-900">{title}</h3>
          <button onClick={onClose} aria-label="Fechar" className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
            <X className="h-5 w-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function TransactionModal({ onClose, onSave }) {
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const fileRef = useRef(null);

  useEffect(() => {
    return () => { if (previewUrl) URL.revokeObjectURL(previewUrl); };
  }, [previewUrl]);

  function handleFile(e) {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    setFile(f);
    setPreviewUrl(URL.createObjectURL(f));
  }

  function clearFile() {
    setFile(null);
    setPreviewUrl(null);
    if (fileRef.current) fileRef.current.value = '';
  }

  async function handleSubmit() {
    const newErrors = {};
    if (!file) newErrors.image = 'Anexe o print do comprovante.';
    if (!description.trim()) newErrors.description = 'Conte o que foi esse gasto.';
    const numAmount = parseAmount(amount);
    if (!amount || isNaN(numAmount) || numAmount <= 0) newErrors.amount = 'Informe um valor válido.';
    if (Object.keys(newErrors).length) { setErrors(newErrors); return; }
    setSaving(true);
    await onSave({ amount: numAmount, description: description.trim(), date }, file);
    setSaving(false);
  }

  return (
    <Modal title="Novo comprovante" onClose={onClose}>
      <div className="space-y-4">
        <div>
          <label className="mb-1.5 block text-sm text-slate-600">Comprovante</label>
          <input ref={fileRef} type="file" accept="image/*" onChange={handleFile} className="hidden" />
          {previewUrl ? (
            <div className="relative">
              <img src={previewUrl} alt="Comprovante anexado" className="max-h-48 w-full rounded-lg border border-slate-200 object-contain" />
              <button onClick={clearFile} aria-label="Remover imagem" className="absolute right-2 top-2 rounded-full bg-white p-1 text-slate-600 shadow hover:text-slate-900">
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <button
              onClick={() => fileRef.current && fileRef.current.click()}
              className="flex w-full flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-slate-300 bg-slate-50 py-8 text-slate-500 hover:border-rose-300 hover:bg-rose-50 hover:text-rose-600"
            >
              <Upload className="h-6 w-6" />
              <span className="text-sm">Toque para anexar o print</span>
            </button>
          )}
          {errors.image && <p className="mt-1 text-sm text-rose-600">{errors.image}</p>}
        </div>

        <div>
          <label className="mb-1.5 block text-sm text-slate-600">Valor</label>
          <div className="flex items-center rounded-lg border border-slate-300 px-3 focus-within:border-slate-500">
            <span className="text-slate-400">R$</span>
            <input
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0,00"
              className="tabular-nums w-full bg-transparent px-2 py-2 text-slate-900 outline-none"
            />
          </div>
          {errors.amount && <p className="mt-1 text-sm text-rose-600">{errors.amount}</p>}
        </div>

        <div>
          <label className="mb-1.5 block text-sm text-slate-600">O que foi e por quê</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            placeholder="Ex: jantar de aniversário da Marina, dividimos a conta"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 outline-none focus:border-slate-500"
          />
          {errors.description && <p className="mt-1 text-sm text-rose-600">{errors.description}</p>}
        </div>

        <div>
          <label className="mb-1.5 block text-sm text-slate-600">Data</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 outline-none focus:border-slate-500"
          />
        </div>

        <div className="flex gap-3 pt-2">
          <button onClick={onClose} disabled={saving} className="flex-1 rounded-lg border border-slate-300 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50">
            Cancelar
          </button>
          <button onClick={handleSubmit} disabled={saving} className="flex-1 rounded-lg bg-rose-600 py-2.5 text-sm font-medium text-white hover:bg-rose-700 disabled:opacity-50">
            {saving ? 'Salvando...' : 'Salvar gasto'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function TransactionsTab({ items, total, onAdd, onDelete, onViewImage }) {
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 rounded-xl border border-rose-100 bg-rose-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm text-rose-700">total variável do mês</p>
          <p className="font-display tabular-nums text-2xl font-semibold text-rose-700">{brl(total)}</p>
        </div>
        <button
          onClick={onAdd}
          className="flex items-center justify-center gap-2 rounded-full bg-rose-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-rose-700"
        >
          <Upload className="h-4 w-4" />
          Novo comprovante
        </button>
      </div>

      {items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 py-10 text-center text-slate-500">
          <p>Nenhum lançamento neste mês ainda.</p>
          <p className="text-sm">Toda vez que gastar fora do combinado, registre aqui com o print e o motivo.</p>
        </div>
      ) : (
        <ul className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white">
          {items.map((t) => (
            <li key={t.id} className="flex items-center gap-3 px-4 py-3">
              <button onClick={() => onViewImage(t.image)} aria-label="Ver comprovante" className="h-12 w-12 shrink-0 overflow-hidden rounded-lg border border-slate-200">
                <img src={t.image} alt="" className="h-full w-full object-cover" />
              </button>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-slate-800">{t.description}</p>
                <p className="text-xs text-slate-400">{new Date(t.date + 'T00:00:00').toLocaleDateString('pt-BR')}</p>
              </div>
              <p className="tabular-nums shrink-0 font-medium text-rose-600">{brl(t.amount)}</p>
              <button
                onClick={() => onDelete(t.id)}
                aria-label="Excluir lançamento"
                className="shrink-0 rounded-full p-1.5 text-slate-300 hover:bg-slate-100 hover:text-rose-500"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ImageLightbox({ src, onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-70 p-4" onClick={onClose}>
      <img src={src} alt="Comprovante" style={{ maxHeight: '85vh' }} className="max-w-full rounded-lg object-contain" onClick={(e) => e.stopPropagation()} />
      <button onClick={onClose} aria-label="Fechar" className="absolute right-4 top-4 rounded-full bg-white p-2 text-slate-700 hover:text-slate-900">
        <X className="h-5 w-5" />
      </button>
    </div>
  );
}

function FixedExpensesTab({ items, paid, onToggle, onAdd, onEdit, onDelete, total, paidTotal, pendingTotal }) {
  const pct = total > 0 ? Math.round((paidTotal / total) * 100) : 0;
  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="mb-3 flex items-center justify-between text-sm">
          <span className="text-slate-500">pago no ciclo</span>
          <span className="tabular-nums text-slate-700">{brl(paidTotal)} de {brl(total)}</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-slate-100">
          <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} />
        </div>
        <div className="mt-3 flex justify-between text-xs">
          <span className="text-emerald-600">{brl(paidTotal)} pago</span>
          <span className="text-rose-500">{brl(pendingTotal)} pendente</span>
        </div>
      </div>

      <button
        onClick={onAdd}
        className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-slate-300 py-2.5 text-sm font-medium text-slate-500 hover:border-slate-400 hover:text-slate-700"
      >
        <Plus className="h-4 w-4" /> Adicionar gasto fixo
      </button>

      <ul className="space-y-2">
        {items.map((f) => {
          const Icon = ICON_LIBRARY[f.icon] || Home;
          const isPaid = !!paid[f.id];
          return (
            <li
              key={f.id}
              className={`flex items-center gap-3 rounded-xl border px-4 py-3 transition-colors ${
                isPaid ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200 bg-white'
              }`}
            >
              <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${isPaid ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                <Icon className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-slate-800">{f.name}</p>
                <p className="tabular-nums text-xs text-slate-400">{brl(f.amount)}</p>
              </div>
              <button onClick={() => onEdit(f)} aria-label={`Editar ${f.name}`} className="rounded-full p-1.5 text-slate-300 hover:bg-slate-100 hover:text-slate-600">
                <Pencil className="h-4 w-4" />
              </button>
              <button onClick={() => onDelete(f.id)} aria-label={`Excluir ${f.name}`} className="rounded-full p-1.5 text-slate-300 hover:bg-slate-100 hover:text-rose-500">
                <Trash2 className="h-4 w-4" />
              </button>
              <button
                onClick={() => onToggle(f.id)}
                aria-pressed={isPaid}
                aria-label={isPaid ? `Marcar ${f.name} como pendente` : `Marcar ${f.name} como pago`}
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
                  isPaid ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-slate-300 text-transparent hover:border-emerald-400'
                }`}
              >
                <Check className="h-4 w-4" />
              </button>
            </li>
          );
        })}
      </ul>
      {items.length === 0 && (
        <p className="py-6 text-center text-sm text-slate-400">
          Nenhum gasto fixo cadastrado. Adicione o aluguel, as contas e assinaturas do mês.
        </p>
      )}
    </div>
  );
}

function FixedExpenseModal({ editing, onClose, onSave }) {
  const [name, setName] = useState(editing ? editing.name : '');
  const [amount, setAmount] = useState(editing ? String(editing.amount) : '');
  const [icon, setIcon] = useState(editing ? editing.icon : ICON_KEYS[0]);
  const [error, setError] = useState('');

  function handleSubmit() {
    const numAmount = parseAmount(amount);
    if (!name.trim()) { setError('Dê um nome para esse gasto.'); return; }
    if (!amount || isNaN(numAmount) || numAmount <= 0) { setError('Informe um valor válido.'); return; }
    onSave({ name: name.trim(), amount: numAmount, icon });
  }

  return (
    <Modal title={editing ? 'Editar gasto fixo' : 'Novo gasto fixo'} onClose={onClose}>
      <div className="space-y-4">
        <div>
          <label className="mb-1.5 block text-sm text-slate-600">Nome</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ex: Academia"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-slate-500"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-sm text-slate-600">Valor mensal</label>
          <div className="flex items-center rounded-lg border border-slate-300 px-3 focus-within:border-slate-500">
            <span className="text-slate-400">R$</span>
            <input
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0,00"
              className="tabular-nums w-full bg-transparent px-2 py-2 outline-none"
            />
          </div>
        </div>
        <div>
          <label className="mb-1.5 block text-sm text-slate-600">Ícone</label>
          <div className="flex flex-wrap gap-2">
            {ICON_KEYS.map((key) => {
              const Icon = ICON_LIBRARY[key];
              const active = icon === key;
              return (
                <button
                  key={key}
                  onClick={() => setIcon(key)}
                  aria-label={key}
                  className={`flex h-10 w-10 items-center justify-center rounded-full border-2 ${
                    active ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 text-slate-500 hover:border-slate-400'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                </button>
              );
            })}
          </div>
        </div>
        {error && <p className="text-sm text-rose-600">{error}</p>}
        <div className="flex gap-3 pt-2">
          <button onClick={onClose} className="flex-1 rounded-lg border border-slate-300 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50">
            Cancelar
          </button>
          <button onClick={handleSubmit} className="flex-1 rounded-lg bg-slate-900 py-2.5 text-sm font-medium text-white hover:bg-slate-800">
            Salvar
          </button>
        </div>
      </div>
    </Modal>
  );
}

function InlineNumberField({ label, value, onChange, color }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value || ''));

  useEffect(() => { setDraft(String(value || '')); }, [value]);

  function commit() {
    const num = parseAmount(draft);
    onChange(isNaN(num) ? 0 : num);
    setEditing(false);
  }

  return (
    <div>
      <p className="text-sm text-slate-500">{label}</p>
      {editing ? (
        <div className="mt-1 flex items-center rounded-lg border border-slate-300 px-2 focus-within:border-slate-500">
          <span className="text-sm text-slate-400">R$</span>
          <input
            autoFocus
            inputMode="decimal"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false); }}
            onBlur={commit}
            className="tabular-nums w-32 bg-transparent px-1.5 py-1.5 outline-none"
          />
        </div>
      ) : (
        <button onClick={() => setEditing(true)} className="group mt-1 flex items-center gap-2">
          <span className={`font-display tabular-nums text-2xl font-semibold ${color}`}>{brl(value)}</span>
          <Pencil className="h-3.5 w-3.5 text-slate-300 group-hover:text-slate-500" />
        </button>
      )}
    </div>
  );
}

function BrickProgress({ pct }) {
  const cols = 10;
  const rows = 3;
  const total = cols * rows;
  const filled = Math.round((pct / 100) * total);
  return (
    <div className="grid grid-cols-10 gap-1.5">
      {Array.from({ length: total }).map((_, i) => (
        <div key={i} className={`aspect-square rounded-sm ${i < filled ? 'bg-amber-500' : 'border border-slate-200 bg-slate-100'}`} />
      ))}
    </div>
  );
}

function InvestmentsTab({ investments, contribution, monthKeyStr, onSetBalance, onSetContribution, onSetGoal }) {
  const [editingGoal, setEditingGoal] = useState(false);
  const [goalNameDraft, setGoalNameDraft] = useState(investments.goalName);
  const [goalAmountDraft, setGoalAmountDraft] = useState(String(investments.goalAmount));

  const goalAmount = Number(investments.goalAmount) || 0;
  const balance = Number(investments.balance) || 0;
  const pct = goalAmount > 0 ? Math.min(100, Math.round((balance / goalAmount) * 100)) : 0;
  const remaining = Math.max(0, goalAmount - balance);

  function saveGoal() {
    const num = parseAmount(goalAmountDraft);
    onSetGoal(goalNameDraft.trim() || investments.goalName, isNaN(num) ? investments.goalAmount : num);
    setEditingGoal(false);
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-amber-100 bg-amber-50 p-5">
        <div className="mb-4 flex items-start justify-between gap-3">
          {editingGoal ? (
            <div className="flex-1 space-y-2">
              <input
                value={goalNameDraft}
                onChange={(e) => setGoalNameDraft(e.target.value)}
                className="font-display w-full rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-lg outline-none"
              />
              <div className="flex items-center rounded-lg border border-amber-300 bg-white px-3">
                <span className="text-sm text-slate-400">meta: R$</span>
                <input
                  inputMode="decimal"
                  value={goalAmountDraft}
                  onChange={(e) => setGoalAmountDraft(e.target.value)}
                  className="tabular-nums w-full bg-transparent px-2 py-1.5 outline-none"
                />
              </div>
              <div className="flex gap-2">
                <button onClick={saveGoal} className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm text-white">Salvar</button>
                <button onClick={() => setEditingGoal(false)} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-600">Cancelar</button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => { setGoalNameDraft(investments.goalName); setGoalAmountDraft(String(investments.goalAmount)); setEditingGoal(true); }}
              className="group flex flex-1 items-start gap-2 text-left"
            >
              <div>
                <h3 className="font-display text-lg font-semibold text-slate-900">{investments.goalName}</h3>
                <p className="text-sm text-slate-500">meta de {brl(investments.goalAmount)}</p>
              </div>
              <Pencil className="mt-1 h-3.5 w-3.5 shrink-0 text-slate-300 group-hover:text-slate-500" />
            </button>
          )}
          <span className="font-display tabular-nums shrink-0 text-2xl font-semibold text-amber-700">{pct}%</span>
        </div>

        <BrickProgress pct={pct} />

        <p className="mt-3 text-sm text-slate-500">
          faltam <span className="tabular-nums font-medium text-slate-700">{brl(remaining)}</span> para a meta
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <InlineNumberField label="reserva atual (total guardado)" value={investments.balance} onChange={onSetBalance} color="text-slate-900" />
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <InlineNumberField
            label="aporte deste mês"
            value={contribution}
            onChange={(v) => onSetContribution(monthKeyStr, v)}
            color="text-emerald-700"
          />
        </div>
      </div>
    </div>
  );
}

function SummaryRow({ label, value, textClass, colorClass }) {
  return (
    <div className="flex items-center justify-between border-b border-slate-100 pb-3">
      <div className="flex items-center gap-2">
        <span className={`h-2 w-2 rounded-full ${colorClass}`} />
        <span className="text-sm text-slate-600">{label}</span>
      </div>
      <span className={`tabular-nums font-medium ${textClass}`}>{brl(value)}</span>
    </div>
  );
}

function SummaryDrawer({ monthLabel, fixedTotal, variableTotal, contribution, onClose }) {
  const sum = fixedTotal + variableTotal + contribution || 1;
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black bg-opacity-50" onClick={onClose}>
      <div className="h-full w-full max-w-sm overflow-y-auto bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-6 flex items-center justify-between">
          <h3 className="font-display text-lg font-semibold text-slate-900">resumo de {monthLabel}</h3>
          <button onClick={onClose} aria-label="Fechar" className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4">
          <SummaryRow label="gastos fixos" value={fixedTotal} colorClass="bg-slate-700" textClass="text-slate-700" />
          <SummaryRow label="gastos variáveis" value={variableTotal} colorClass="bg-rose-500" textClass="text-rose-600" />
          <SummaryRow label="investido no mês" value={contribution} colorClass="bg-amber-500" textClass="text-amber-700" />
        </div>

        <div className="mt-6 flex h-2.5 overflow-hidden rounded-full bg-slate-100">
          <div className="bg-slate-700" style={{ width: `${(fixedTotal / sum) * 100}%` }} />
          <div className="bg-rose-500" style={{ width: `${(variableTotal / sum) * 100}%` }} />
          <div className="bg-amber-500" style={{ width: `${(contribution / sum) * 100}%` }} />
        </div>
      </div>
    </div>
  );
}

function ErrorToast({ message, onDismiss }) {
  return (
    <div className="fixed inset-x-4 bottom-4 z-50 mx-auto flex max-w-sm items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700 shadow-lg sm:left-auto sm:right-4">
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
      <p className="flex-1">{message}</p>
      <button onClick={onDismiss} aria-label="Dispensar aviso" className="text-rose-400 hover:text-rose-600">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
