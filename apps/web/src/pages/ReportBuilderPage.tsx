import { useState } from "react";
import { ArrowDown, ArrowUp, Check, Eye, FileEdit, FileText, Image as ImageIcon, Layout, LayoutTemplate, Plus, Save, Settings2, Trash2 } from "lucide-react";

type SectionType = "executive-summary" | "heatmap-snapshot" | "top-10-rank" | "fiscal-gap-analysis" | "custom-text";

interface ReportSection {
  id: string;
  type: SectionType;
  title: string;
}

const AVAILABLE_SECTIONS: { type: SectionType; label: string }[] = [
  { type: "executive-summary", label: "Executive Summary" },
  { type: "heatmap-snapshot", label: "Heatmap Snapshot" },
  { type: "top-10-rank", label: "Top 10 Rank" },
  { type: "fiscal-gap-analysis", label: "Fiscal Gap Analysis" },
  { type: "custom-text", label: "Custom Text Block" },
];

export function ReportBuilderPage() {
  const [sections, setSections] = useState<ReportSection[]>([
    { id: "1", type: "executive-summary", title: "Executive Summary" },
    { id: "2", type: "heatmap-snapshot", title: "Heatmap Snapshot" },
  ]);

  const [settings, setSettings] = useState({
    instansiName: "Kementerian Keuangan",
    pejabatName: "John Doe",
    pejabatNIP: "198001012005011001",
    includeAnnexes: true,
  });

  const [activeTab, setActiveTab] = useState<"builder" | "preview">("builder");
  const [showToast, setShowToast] = useState(false);

  const moveSection = (index: number, direction: "up" | "down") => {
    if (direction === "up" && index === 0) return;
    if (direction === "down" && index === sections.length - 1) return;

    const newSections = [...sections];
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    const temp = newSections[index];
    newSections[index] = newSections[targetIndex];
    newSections[targetIndex] = temp;

    setSections(newSections);
  };

  const removeSection = (id: string) => {
    setSections(sections.filter(s => s.id !== id));
  };

  const addSection = (type: SectionType, title: string) => {
    setSections([
      ...sections,
      {
        id: Math.random().toString(36).slice(2, 9),
        type,
        title,
      }
    ]);
  };

  const handleSave = () => {
    setShowToast(true);
    setTimeout(() => setShowToast(false), 3000);
  };

  return (
    <main className="flex h-full flex-col bg-slate-50 dark:bg-slate-950 p-6 overflow-y-auto">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        {/* Header */}
        <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <LayoutTemplate className="h-6 w-6 text-emerald-600" />
              Report Template Builder
            </h1>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
              Desain template laporan resmi dengan modul visualisasi.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center rounded-lg border border-slate-200 bg-white p-1 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <button
                type="button"
                onClick={() => setActiveTab("builder")}
                className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  activeTab === "builder"
                    ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300"
                    : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
                }`}
              >
                <Layout className="h-4 w-4" />
                Builder
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("preview")}
                className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  activeTab === "preview"
                    ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300"
                    : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
                }`}
              >
                <Eye className="h-4 w-4" />
                Preview
              </button>
            </div>
            <button
              type="button"
              onClick={handleSave}
              className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-emerald-700"
            >
              <Save className="h-4 w-4" />
              Simpan Template
            </button>
          </div>
        </header>

        {activeTab === "builder" ? (
          <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-3">
            {/* Left Column: Sections & Settings */}
            <div className="flex flex-col gap-6 lg:col-span-1">
              {/* Template Settings */}
              <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                <div className="mb-4 flex items-center gap-2 border-b border-slate-100 pb-3 dark:border-slate-800">
                  <Settings2 className="h-5 w-5 text-slate-500" />
                  <h2 className="font-semibold text-slate-800 dark:text-slate-200">Pengaturan Dokumen</h2>
                </div>
                
                <div className="space-y-4">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
                      Nama Instansi
                    </label>
                    <input
                      type="text"
                      value={settings.instansiName}
                      onChange={(e) => setSettings({ ...settings, instansiName: e.target.value })}
                      className="w-full rounded-md border border-slate-300 bg-transparent px-3 py-2 text-sm placeholder-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:border-slate-700 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
                      Penandatangan (Pejabat)
                    </label>
                    <input
                      type="text"
                      value={settings.pejabatName}
                      onChange={(e) => setSettings({ ...settings, pejabatName: e.target.value })}
                      className="w-full rounded-md border border-slate-300 bg-transparent px-3 py-2 text-sm placeholder-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:border-slate-700 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
                      NIP Penandatangan
                    </label>
                    <input
                      type="text"
                      value={settings.pejabatNIP}
                      onChange={(e) => setSettings({ ...settings, pejabatNIP: e.target.value })}
                      className="w-full rounded-md border border-slate-300 bg-transparent px-3 py-2 text-sm placeholder-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:border-slate-700 dark:text-white"
                    />
                  </div>
                  <div className="flex items-center gap-2 pt-2">
                    <input
                      type="checkbox"
                      id="annex-check"
                      checked={settings.includeAnnexes}
                      onChange={(e) => setSettings({ ...settings, includeAnnexes: e.target.checked })}
                      className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-600 dark:border-slate-700 dark:bg-slate-800"
                    />
                    <label htmlFor="annex-check" className="text-sm font-medium text-slate-700 dark:text-slate-300">
                      Sertakan Lampiran (Annex)
                    </label>
                  </div>
                </div>
              </section>

              {/* Add New Section */}
              <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                <div className="mb-4 flex items-center gap-2 border-b border-slate-100 pb-3 dark:border-slate-800">
                  <Plus className="h-5 w-5 text-slate-500" />
                  <h2 className="font-semibold text-slate-800 dark:text-slate-200">Tambah Bagian</h2>
                </div>
                <div className="flex flex-col gap-2">
                  {AVAILABLE_SECTIONS.map((sec) => (
                    <button
                      key={sec.type}
                      type="button"
                      onClick={() => addSection(sec.type, sec.label)}
                      className="flex items-center justify-between rounded-lg border border-slate-200 p-3 text-left transition-colors hover:border-emerald-300 hover:bg-emerald-50 dark:border-slate-700 dark:hover:border-emerald-700/50 dark:hover:bg-emerald-900/20"
                    >
                      <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                        {sec.label}
                      </span>
                      <Plus className="h-4 w-4 text-emerald-600" />
                    </button>
                  ))}
                </div>
              </section>
            </div>

            {/* Right Column: Sections Canvas */}
            <div className="lg:col-span-2">
              <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900 min-h-[600px]">
                <h2 className="mb-6 text-lg font-semibold text-slate-800 dark:text-slate-200">
                  Struktur Laporan
                </h2>
                
                {sections.length === 0 ? (
                  <div className="flex h-48 flex-col items-center justify-center rounded-lg border-2 border-dashed border-slate-300 bg-slate-50 dark:border-slate-700 dark:bg-slate-900/50">
                    <LayoutTemplate className="mb-2 h-8 w-8 text-slate-400" />
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                      Laporan kosong. Tambahkan bagian dari panel kiri.
                    </p>
                  </div>
                ) : (
                  <div className="flex flex-col gap-3">
                    {sections.map((section, index) => (
                      <div
                        key={section.id}
                        className="group flex items-center justify-between rounded-lg border border-slate-200 bg-white p-4 shadow-sm transition-all hover:border-emerald-300 hover:shadow-md dark:border-slate-700 dark:bg-slate-800 dark:hover:border-emerald-700"
                      >
                        <div className="flex items-center gap-4">
                          <div className="flex flex-col gap-1">
                            <button
                              type="button"
                              onClick={() => moveSection(index, "up")}
                              disabled={index === 0}
                              className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30 dark:hover:bg-slate-700 dark:hover:text-slate-200"
                            >
                              <ArrowUp className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => moveSection(index, "down")}
                              disabled={index === sections.length - 1}
                              className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30 dark:hover:bg-slate-700 dark:hover:text-slate-200"
                            >
                              <ArrowDown className="h-4 w-4" />
                            </button>
                          </div>
                          
                          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-900">
                            {section.type === "executive-summary" && <FileText className="h-5 w-5 text-indigo-500" />}
                            {section.type === "heatmap-snapshot" && <ImageIcon className="h-5 w-5 text-rose-500" />}
                            {section.type === "top-10-rank" && <Layout className="h-5 w-5 text-amber-500" />}
                            {section.type === "fiscal-gap-analysis" && <FileEdit className="h-5 w-5 text-emerald-500" />}
                            {section.type === "custom-text" && <FileText className="h-5 w-5 text-slate-500" />}
                          </div>
                          
                          <div>
                            <h3 className="font-medium text-slate-800 dark:text-slate-200">
                              {section.title}
                            </h3>
                            <p className="text-xs text-slate-500 dark:text-slate-400">
                              Modul: {section.type}
                            </p>
                          </div>
                        </div>
                        
                        <button
                          type="button"
                          onClick={() => removeSection(section.id)}
                          className="rounded-lg p-2 text-slate-400 opacity-0 transition-all hover:bg-rose-100 hover:text-rose-600 group-hover:opacity-100 dark:hover:bg-rose-900/30 dark:hover:text-rose-400"
                        >
                          <Trash2 className="h-5 w-5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          /* Preview Mode */
          <div className="flex items-center justify-center py-6">
            <div className="w-[210mm] min-h-[297mm] bg-white shadow-xl flex flex-col px-[25.4mm] py-[25.4mm] text-black">
              {/* Kop Surat / Header */}
              <div className="border-b-2 border-black pb-4 mb-8 text-center flex flex-col items-center">
                <div className="h-16 w-16 bg-slate-200 rounded-full mb-3 flex items-center justify-center">
                  <span className="text-xs text-slate-500 font-bold">LOGO</span>
                </div>
                <h1 className="text-xl font-bold uppercase tracking-wider">{settings.instansiName}</h1>
                <p className="text-sm mt-1">Laporan Analisis Eksekutif Daerah</p>
              </div>

              {/* Body */}
              <div className="flex-1 flex flex-col gap-8">
                {sections.map((section, idx) => (
                  <div key={section.id} className="border-b border-slate-200 pb-6 last:border-0">
                    <h2 className="text-lg font-bold mb-3">
                      {idx + 1}. {section.title}
                    </h2>
                    
                    {/* Placeholder content based on section type */}
                    <div className="bg-slate-50 p-4 rounded border border-slate-100 min-h-[100px] flex items-center justify-center text-slate-400 text-sm">
                      [ Konten dinamis untuk modul &quot;{section.type}&quot; akan dirender di sini ]
                    </div>
                  </div>
                ))}
              </div>

              {/* Tanda Tangan */}
              <div className="mt-16 pt-8 flex justify-end">
                <div className="text-center w-64">
                  <p className="mb-20 text-sm">Jakarta, {new Date().toLocaleDateString('id-ID')}</p>
                  <p className="font-bold underline text-sm">{settings.pejabatName}</p>
                  <p className="text-sm mt-1">NIP. {settings.pejabatNIP}</p>
                </div>
              </div>

              {/* Annex */}
              {settings.includeAnnexes && (
                <div className="mt-8 pt-4 border-t border-dashed border-slate-300 text-xs text-slate-500">
                  <p>* Lampiran (Annex) akan digenerate secara otomatis pada halaman terpisah.</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Toast Notification */}
      {showToast && (
        <div className="fixed bottom-6 right-6 flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-3 text-sm font-medium text-white shadow-lg animate-in slide-in-from-bottom-4">
          <Check className="h-5 w-5" />
          Template laporan berhasil disimpan.
        </div>
      )}
    </main>
  );
}
