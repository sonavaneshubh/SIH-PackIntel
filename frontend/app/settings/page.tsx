'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { useAuth } from '@/lib/authContext';
import { supabase, isSupabaseConfigured } from '@/lib/supabase/client';
import { deleteAllMyInspections } from '@/lib/supabase/inspectionService';

// ─── Types ────────────────────────────────────────────────────────────────────

type TabId =
  | 'profile'
  | 'scan_ocr'
  | 'compliance'
  | 'reports'
  | 'notifications'
  | 'data_history'
  | 'security'
  | 'system';

interface Tab {
  id: TabId;
  label: string;
  icon: string;
}

interface NotificationSettings {
  scan_completed: boolean;
  compliance_failure: boolean;
  amber_review_required: boolean;
  low_ocr_confidence: boolean;
  report_generated: boolean;
}

interface ReportSettings {
  pdf_format: 'A4' | 'Letter';
  include_front_image: boolean;
  include_back_image: boolean;
  include_ocr_text: boolean;
  include_extracted_fields: boolean;
  include_compliance_violations: boolean;
  include_confidence_scores: boolean;
  include_officer_details: boolean;
}

interface ScanSettings {
  ocr_confidence_threshold: number;
  ocr_language: string;
  scan_both_sides: boolean;
  blur_detection: boolean;
  image_enhancement: boolean;
  keep_original_images: boolean;
}

interface ComplianceSettings {
  min_confidence_auto_pass: number;
  amber_review_threshold: number;
  required_statutory_fields: string[];
  compliance_rule_validation: boolean;
  rule_version: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const TABS: Tab[] = [
  { id: 'profile', label: 'Profile & Account', icon: 'account_circle' },
  { id: 'scan_ocr', label: 'Scan & OCR', icon: 'document_scanner' },
  { id: 'compliance', label: 'Compliance & Rules', icon: 'gavel' },
  { id: 'reports', label: 'Report Settings', icon: 'description' },
  { id: 'notifications', label: 'Notifications', icon: 'notifications' },
  { id: 'data_history', label: 'Data & History', icon: 'history' },
  { id: 'security', label: 'Security & Privacy', icon: 'security' },
  { id: 'system', label: 'System Information', icon: 'info' },
];

const STATUTORY_FIELDS = [
  'Commodity Name',
  'Net Quantity',
  'MRP',
  'Manufacturer Name',
  'Month & Year of Manufacture',
  'Customer Care Details',
  'Country of Origin',
];

const ADMIN_ROLES = ['admin', 'Senior Legal Metrology Inspector', 'Administrator'];

// ─── Utility Components ───────────────────────────────────────────────────────

function SectionCard({ title, description, children, icon }: {
  title: string;
  description?: string;
  children: React.ReactNode;
  icon?: string;
}) {
  return (
    <div className="bg-surface-container-lowest border border-outline-variant rounded-xl shadow-xs overflow-hidden">
      <div className="px-6 py-4 border-b border-outline-variant bg-surface-container-low flex items-center gap-3">
        {icon && (
          <span className="material-symbols-outlined text-[20px] text-primary">{icon}</span>
        )}
        <div>
          <h3 className="text-sm font-semibold text-on-surface">{title}</h3>
          {description && (
            <p className="text-xs text-on-surface-variant mt-0.5">{description}</p>
          )}
        </div>
      </div>
      <div className="p-6">{children}</div>
    </div>
  );
}

function SettingRow({ label, description, children }: {
  label: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 py-3 border-b border-outline-variant/50 last:border-0">
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-on-surface">{label}</p>
        {description && <p className="text-[11px] text-on-surface-variant mt-0.5">{description}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function Toggle({ checked, onChange, disabled }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-1 ${
        checked ? 'bg-primary' : 'bg-surface-container-highest'
      } ${disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
    >
      <span
        className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform shadow-sm ${
          checked ? 'translate-x-4' : 'translate-x-0.5'
        }`}
      />
    </button>
  );
}

function InfoRow({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex justify-between items-center py-2.5 border-b border-outline-variant/50 last:border-0">
      <span className="text-xs font-medium text-on-surface">{label}</span>
      <span className={`text-xs text-on-surface-variant ${mono ? 'font-mono text-primary' : ''}`}>
        {value}
      </span>
    </div>
  );
}

function StatusDot({ online }: { online: boolean }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={`w-2 h-2 rounded-full ${online ? 'bg-green-500' : 'bg-error'}`} />
      <span className={`text-xs font-medium ${online ? 'text-green-600' : 'text-error'}`}>
        {online ? 'Online' : 'Offline'}
      </span>
    </span>
  );
}

function SaveBanner({ saved }: { saved: boolean }) {
  if (!saved) return null;
  return (
    <div className="fixed bottom-6 right-6 z-50 bg-primary text-on-primary text-xs font-semibold px-4 py-3 rounded-xl shadow-lg flex items-center gap-2 animate-in slide-in-from-bottom-4">
      <span className="material-symbols-outlined text-[16px]">check_circle</span>
      Settings saved successfully!
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const { user, supabaseUser, signOut, updatePassword, isSupabaseConnected } = useAuth();
  const isAdmin = ADMIN_ROLES.some(r => user?.role?.includes(r));
  const isDemo = user?.isDemo ?? false;

  // Active tab
  const [activeTab, setActiveTab] = useState<TabId>('profile');

  // Global save state
  const [saved, setSaved] = useState(false);

  // ── Profile State ──────────────────────────────────────────────────────────
  const [profileName, setProfileName] = useState(user?.name || '');
  const [profileDept, setProfileDept] = useState(user?.department || '');
  const [profileEditing, setProfileEditing] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileMsg, setProfileMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Change Password Modal
  const [pwdModalOpen, setPwdModalOpen] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwdMsg, setPwdMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [pwdSaving, setPwdSaving] = useState(false);

  // Logout confirm
  const [logoutModalOpen, setLogoutModalOpen] = useState(false);

  // ── Scan & OCR State ───────────────────────────────────────────────────────
  const [scanSettings, setScanSettings] = useState<ScanSettings>({
    ocr_confidence_threshold: 80,
    ocr_language: 'en',
    scan_both_sides: true,
    blur_detection: true,
    image_enhancement: true,
    keep_original_images: false,
  });

  // ── Compliance State ───────────────────────────────────────────────────────
  // Existing: confidence threshold
  const [complianceSettings, setComplianceSettings] = useState<ComplianceSettings>({
    min_confidence_auto_pass: 85,
    amber_review_threshold: 70,
    required_statutory_fields: [...STATUTORY_FIELDS],
    compliance_rule_validation: true,
    rule_version: '2011-LMPC-v3.2',
  });
  // Legacy existing state (preserved for backward compatibility)
  const [autoVerifyPass, setAutoVerifyPass] = useState(true);

  // ── Report State ───────────────────────────────────────────────────────────
  const [reportSettings, setReportSettings] = useState<ReportSettings>({
    pdf_format: 'A4',
    include_front_image: true,
    include_back_image: true,
    include_ocr_text: false,
    include_extracted_fields: true,
    include_compliance_violations: true,
    include_confidence_scores: true,
    include_officer_details: true,
  });

  // ── Notification State ─────────────────────────────────────────────────────
  const [notifSettings, setNotifSettings] = useState<NotificationSettings>({
    scan_completed: true,
    compliance_failure: true,
    amber_review_required: true,
    low_ocr_confidence: false,
    report_generated: false,
  });

  // ── Data & History State ───────────────────────────────────────────────────
  const [inspectionCount, setInspectionCount] = useState<number | null>(null);
  const [clearDataModalOpen, setClearDataModalOpen] = useState(false);
  const [clearDataConfirm, setClearDataConfirm] = useState('');
  const [clearDataLoading, setClearDataLoading] = useState(false);
  const [clearDataMsg, setClearDataMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [exportLoading, setExportLoading] = useState(false);

  // ── System State ───────────────────────────────────────────────────────────
  const [apiOnline, setApiOnline] = useState<boolean | null>(null);
  const [dbOnline, setDbOnline] = useState<boolean | null>(null);

  // ─── Effects ──────────────────────────────────────────────────────────────

  useEffect(() => {
    if (user) {
      setProfileName(user.name || '');
      setProfileDept(user.department || '');
    }
  }, [user]);

  // Load inspection count
  useEffect(() => {
    if (!isSupabaseConnected) return;
    (async () => {
      const { data: { user: sbUser } } = await supabase.auth.getUser();
      if (!sbUser) return;
      const { count } = await supabase
        .from('inspections')
        .select('*', { count: 'exact', head: true })
        .eq('inspector_id', sbUser.id);
      setInspectionCount(count ?? 0);
    })();
  }, [isSupabaseConnected]);

  // System status check
  useEffect(() => {
    if (!isSupabaseConnected) {
      setApiOnline(false);
      setDbOnline(false);
      return;
    }
    (async () => {
      try {
        const res = await supabase.from('inspections').select('id', { head: true, count: 'exact' }).limit(1);
        setDbOnline(!res.error);
        setApiOnline(true);
      } catch {
        setApiOnline(false);
        setDbOnline(false);
      }
    })();
  }, [isSupabaseConnected]);

  // Load persisted settings from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem('packintel_settings');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed.scanSettings) setScanSettings(s => ({ ...s, ...parsed.scanSettings }));
        if (parsed.complianceSettings) setComplianceSettings(s => ({ ...s, ...parsed.complianceSettings }));
        if (parsed.reportSettings) setReportSettings(s => ({ ...s, ...parsed.reportSettings }));
        if (parsed.notifSettings) setNotifSettings(s => ({ ...s, ...parsed.notifSettings }));
        if (parsed.autoVerifyPass !== undefined) setAutoVerifyPass(parsed.autoVerifyPass);
      }
    } catch { /* ignore */ }
  }, []);

  // ─── Handlers ─────────────────────────────────────────────────────────────

  const persistSettings = useCallback(() => {
    try {
      localStorage.setItem('packintel_settings', JSON.stringify({
        scanSettings,
        complianceSettings,
        reportSettings,
        notifSettings,
        autoVerifyPass,
      }));
    } catch { /* ignore */ }
  }, [scanSettings, complianceSettings, reportSettings, notifSettings, autoVerifyPass]);

  const handleSave = () => {
    persistSettings();
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  const handleProfileSave = async () => {
    if (!profileName.trim()) {
      setProfileMsg({ type: 'error', text: 'Name cannot be empty.' });
      return;
    }
    setProfileSaving(true);
    setProfileMsg(null);
    try {
      if (isSupabaseConnected && supabaseUser) {
        const { error } = await supabase.auth.updateUser({
          data: { full_name: profileName, department: profileDept },
        });
        if (error) throw error;
        // Also update profiles table if it exists
        await supabase
          .from('profiles')
          .update({ full_name: profileName, department: profileDept })
          .eq('id', supabaseUser.id);
      }
      setProfileMsg({ type: 'success', text: 'Profile updated successfully.' });
      setProfileEditing(false);
    } catch (e: any) {
      setProfileMsg({ type: 'error', text: e?.message || 'Failed to update profile.' });
    } finally {
      setProfileSaving(false);
    }
  };

  const handlePasswordChange = async () => {
    if (!newPassword || newPassword.length < 6) {
      setPwdMsg({ type: 'error', text: 'Password must be at least 6 characters.' });
      return;
    }
    if (newPassword !== confirmPassword) {
      setPwdMsg({ type: 'error', text: 'Passwords do not match.' });
      return;
    }
    if (isDemo) {
      setPwdMsg({ type: 'error', text: 'Password changes are not available in demo mode.' });
      return;
    }
    setPwdSaving(true);
    setPwdMsg(null);
    const result = await updatePassword(newPassword);
    if (result.success) {
      setPwdMsg({ type: 'success', text: 'Password updated successfully.' });
      setNewPassword('');
      setConfirmPassword('');
      setTimeout(() => {
        setPwdModalOpen(false);
        setPwdMsg(null);
      }, 1500);
    } else {
      setPwdMsg({ type: 'error', text: result.error || 'Failed to update password.' });
    }
    setPwdSaving(false);
  };

  const handleExportHistory = async () => {
    if (!isSupabaseConnected) {
      alert('Export requires a Supabase connection.');
      return;
    }
    setExportLoading(true);
    try {
      const { data: { user: sbUser } } = await supabase.auth.getUser();
      if (!sbUser) return;
      const { data, error } = await supabase
        .from('inspections')
        .select('inspection_number, product_name, manufacturer_name, product_category, overall_result, risk_score, created_at')
        .eq('inspector_id', sbUser.id)
        .order('created_at', { ascending: false });
      if (error || !data) throw error;

      const headers = ['Inspection No.', 'Product Name', 'Manufacturer', 'Category', 'Result', 'Risk Score', 'Date'];
      const rows = data.map(r => [
        r.inspection_number,
        r.product_name || '',
        r.manufacturer_name || '',
        r.product_category || '',
        r.overall_result || '',
        r.risk_score ?? '',
        r.created_at ? new Date(r.created_at).toLocaleDateString('en-GB') : '',
      ]);
      const csv = [headers, ...rows].map(row => row.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `PackIntel_InspectionHistory_${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      alert('Failed to export history. Please try again.');
    } finally {
      setExportLoading(false);
    }
  };

  const handleClearAllData = async () => {
    if (clearDataConfirm !== 'DELETE ALL') {
      setClearDataMsg({ type: 'error', text: 'Type "DELETE ALL" exactly to confirm.' });
      return;
    }
    if (isDemo) {
      setClearDataMsg({ type: 'error', text: 'Cannot delete data in demo mode.' });
      return;
    }
    if (!isSupabaseConnected) {
      setClearDataMsg({ type: 'error', text: 'Supabase is not connected.' });
      return;
    }
    setClearDataLoading(true);
    setClearDataMsg(null);
    try {
      const result = await deleteAllMyInspections();
      if (result.error) throw new Error(result.error);
      const removed = result.data?.removedFiles ?? 0;
      setInspectionCount(0);
      setClearDataMsg({
        type: 'success',
        text: `All scan data deleted successfully${removed ? ` (${removed} files removed)` : ''}.`,
      });
      setClearDataConfirm('');
      setTimeout(() => {
        setClearDataModalOpen(false);
        setClearDataMsg(null);
      }, 2000);
    } catch (e: any) {
      setClearDataMsg({ type: 'error', text: e?.message || 'Failed to delete data.' });
    } finally {
      setClearDataLoading(false);
    }
  };

  // ─── Tab Content Renderers ─────────────────────────────────────────────────

  const renderProfile = () => (
    <div className="space-y-4">
      <SectionCard title="Inspector Profile" icon="badge">
        <div className="flex items-start gap-4 mb-5">
          <div className="w-14 h-14 rounded-full bg-primary-container flex items-center justify-center shrink-0">
            <span className="material-symbols-outlined text-[28px] text-primary">account_circle</span>
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold text-on-surface">{user?.name || 'Inspector'}</p>
            <p className="text-xs text-on-surface-variant mt-0.5">{user?.email}</p>
            <span className="inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[10px] font-semibold">
              <span className="material-symbols-outlined text-[12px]">verified_user</span>
              {user?.role || 'Inspector'}
            </span>
          </div>
        </div>

        {profileMsg && (
          <div className={`mb-4 px-3 py-2 rounded-lg text-xs font-medium ${profileMsg.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-error-container text-on-error-container border border-error/20'}`}>
            {profileMsg.text}
          </div>
        )}

        <div className="space-y-3">
          <div>
            <label className="block text-[11px] font-semibold text-on-surface-variant uppercase tracking-wide mb-1">Full Name</label>
            <input
              type="text"
              value={profileName}
              onChange={e => setProfileName(e.target.value)}
              disabled={!profileEditing}
              className="w-full px-3 py-2 text-sm bg-surface-container-low border border-outline-variant rounded-lg text-on-surface focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-60 disabled:cursor-not-allowed"
            />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-on-surface-variant uppercase tracking-wide mb-1">Email Address</label>
            <input
              type="email"
              value={user?.email || ''}
              disabled
              className="w-full px-3 py-2 text-sm bg-surface-container border border-outline-variant rounded-lg text-on-surface-variant opacity-60 cursor-not-allowed"
            />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-on-surface-variant uppercase tracking-wide mb-1">Role</label>
            <input
              type="text"
              value={user?.role || 'Legal Metrology Inspector'}
              disabled
              className="w-full px-3 py-2 text-sm bg-surface-container border border-outline-variant rounded-lg text-on-surface-variant opacity-60 cursor-not-allowed"
            />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-on-surface-variant uppercase tracking-wide mb-1">Organization / Department</label>
            <input
              type="text"
              value={profileDept}
              onChange={e => setProfileDept(e.target.value)}
              disabled={!profileEditing}
              className="w-full px-3 py-2 text-sm bg-surface-container-low border border-outline-variant rounded-lg text-on-surface focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-60 disabled:cursor-not-allowed"
            />
          </div>
        </div>

        <div className="flex gap-3 mt-4 pt-4 border-t border-outline-variant">
          {profileEditing ? (
            <>
              <Button variant="primary" size="sm" icon="save" onClick={handleProfileSave} disabled={profileSaving}>
                {profileSaving ? 'Saving…' : 'Save Profile'}
              </Button>
              <Button variant="outline" size="sm" onClick={() => { setProfileEditing(false); setProfileMsg(null); }}>
                Cancel
              </Button>
            </>
          ) : (
            <Button variant="secondary" size="sm" icon="edit" onClick={() => { setProfileEditing(true); setProfileMsg(null); }}>
              Edit Profile
            </Button>
          )}
        </div>
      </SectionCard>

      <SectionCard title="Account Actions" icon="manage_accounts">
        <div className="space-y-3">
          <div className="flex items-center justify-between py-2">
            <div>
              <p className="text-xs font-semibold text-on-surface">Change Password</p>
              <p className="text-[11px] text-on-surface-variant">Update your account password</p>
            </div>
            <Button
              variant="secondary"
              size="sm"
              icon="lock_reset"
              disabled={isDemo}
              onClick={() => { setPwdModalOpen(true); setPwdMsg(null); }}
            >
              Change Password
            </Button>
          </div>
          {isDemo && (
            <p className="text-[11px] text-on-surface-variant bg-surface-container-low px-3 py-2 rounded-lg">
              Password management is disabled in demo mode.
            </p>
          )}
          <div className="pt-3 border-t border-outline-variant flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-error">Sign Out</p>
              <p className="text-[11px] text-on-surface-variant">End your current session</p>
            </div>
            <Button variant="danger" size="sm" icon="logout" onClick={() => setLogoutModalOpen(true)}>
              Logout
            </Button>
          </div>
        </div>
      </SectionCard>
    </div>
  );

  const renderScanOCR = () => (
    <div className="space-y-4">
      <SectionCard title="OCR Configuration" description="Configure image scanning and text extraction settings" icon="document_scanner">
        <div>
          <div className="flex justify-between items-center mb-1">
            <label className="text-xs font-semibold text-on-surface uppercase tracking-wide">
              OCR Confidence Threshold: {scanSettings.ocr_confidence_threshold}%
            </label>
          </div>
          <input
            type="range" min="50" max="99"
            value={scanSettings.ocr_confidence_threshold}
            onChange={e => setScanSettings(s => ({ ...s, ocr_confidence_threshold: Number(e.target.value) }))}
            className="w-full h-2 bg-surface-container-highest rounded-lg appearance-none cursor-pointer accent-primary"
          />
          <p className="text-[11px] text-on-surface-variant mt-1">
            OCR extractions below {scanSettings.ocr_confidence_threshold}% will be flagged for manual review.
          </p>
        </div>

        <SettingRow label="OCR Language" description="Primary language for text extraction">
          <select
            value={scanSettings.ocr_language}
            onChange={e => setScanSettings(s => ({ ...s, ocr_language: e.target.value }))}
            className="px-3 py-1.5 text-xs bg-surface-container-low border border-outline-variant rounded-lg text-on-surface focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <option value="en">English</option>
            <option value="hi">Hindi</option>
            <option value="en-hi">English + Hindi</option>
            <option value="ta">Tamil</option>
            <option value="te">Telugu</option>
            <option value="mr">Marathi</option>
            <option value="bn">Bengali</option>
            <option value="gu">Gujarati</option>
          </select>
        </SettingRow>

        <SettingRow label="Front + Back Image Scanning" description="Capture both sides of a package label during inspection">
          <Toggle checked={scanSettings.scan_both_sides} onChange={v => setScanSettings(s => ({ ...s, scan_both_sides: v }))} />
        </SettingRow>

        <SettingRow label="Blur / Image-Quality Detection" description="Automatically reject blurry or low-quality images">
          <Toggle checked={scanSettings.blur_detection} onChange={v => setScanSettings(s => ({ ...s, blur_detection: v }))} />
        </SettingRow>

        <SettingRow label="Image Enhancement" description="Apply auto-contrast and sharpening before OCR processing">
          <Toggle checked={scanSettings.image_enhancement} onChange={v => setScanSettings(s => ({ ...s, image_enhancement: v }))} />
        </SettingRow>

        <SettingRow label="Keep Original Scanned Images" description="Retain unprocessed images alongside enhanced versions">
          <Toggle checked={scanSettings.keep_original_images} onChange={v => setScanSettings(s => ({ ...s, keep_original_images: v }))} />
        </SettingRow>
      </SectionCard>
    </div>
  );

  const renderCompliance = () => (
    <div className="space-y-4">
      {!isAdmin && (
        <div className="flex items-start gap-2 px-4 py-3 bg-warning-container border border-warning/30 rounded-xl text-xs text-on-surface">
          <span className="material-symbols-outlined text-[16px] text-warning shrink-0 mt-0.5">lock</span>
          <span><strong>Read-only access.</strong> Critical compliance settings can only be edited by authorized admin users. Contact your system administrator to make changes.</span>
        </div>
      )}

      <SectionCard title="AI Inference & Confidence Thresholds" description="Configure automatic pass/fail confidence levels" icon="psychology">
        <div className="space-y-4">
          <div>
            <div className="flex justify-between items-center mb-1">
              <label className="text-xs font-semibold text-on-surface uppercase tracking-wide">
                Minimum Confidence for Automatic Pass: {complianceSettings.min_confidence_auto_pass}%
              </label>
            </div>
            <input
              type="range" min="70" max="98"
              value={complianceSettings.min_confidence_auto_pass}
              disabled={!isAdmin}
              onChange={e => setComplianceSettings(s => ({ ...s, min_confidence_auto_pass: Number(e.target.value) }))}
              className="w-full h-2 bg-surface-container-highest rounded-lg appearance-none cursor-pointer accent-primary disabled:opacity-50 disabled:cursor-not-allowed"
            />
            <p className="text-[11px] text-on-surface-variant mt-1">
              Fields below {complianceSettings.min_confidence_auto_pass}% will trigger Amber Review.
            </p>
          </div>

          <div className="pt-3 border-t border-outline-variant">
            <div className="flex justify-between items-center mb-1">
              <label className="text-xs font-semibold text-on-surface uppercase tracking-wide">
                Amber Review Threshold: {complianceSettings.amber_review_threshold}%
              </label>
            </div>
            <input
              type="range" min="50" max="85"
              value={complianceSettings.amber_review_threshold}
              disabled={!isAdmin}
              onChange={e => setComplianceSettings(s => ({ ...s, amber_review_threshold: Number(e.target.value) }))}
              className="w-full h-2 bg-surface-container-highest rounded-lg appearance-none cursor-pointer accent-primary disabled:opacity-50 disabled:cursor-not-allowed"
            />
            <p className="text-[11px] text-on-surface-variant mt-1">
              Inspections with OCR confidence between {complianceSettings.amber_review_threshold}% and {complianceSettings.min_confidence_auto_pass}% require human review.
            </p>
          </div>

          <div className="pt-3 border-t border-outline-variant">
            <label className="flex items-center gap-3 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={autoVerifyPass}
                disabled={!isAdmin}
                onChange={e => setAutoVerifyPass(e.target.checked)}
                className="w-4 h-4 rounded border-outline-variant text-primary focus:ring-primary bg-surface-container-lowest disabled:opacity-50"
              />
              <div>
                <p className="text-xs font-semibold text-on-surface">Auto-Certify 100% High-Confidence Scans</p>
                <p className="text-[11px] text-on-surface-variant">
                  Automatically generate dispatch clearance for labels with all 7 statutory fields &gt;95% confidence.
                </p>
              </div>
            </label>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Compliance & Regulatory Rules" description="Legal Metrology (Packaged Commodities) Act, 2011" icon="gavel">
        <SettingRow label="Compliance Rule Validation" description="Enable real-time validation against regulatory ruleset">
          <Toggle
            checked={complianceSettings.compliance_rule_validation}
            onChange={v => isAdmin && setComplianceSettings(s => ({ ...s, compliance_rule_validation: v }))}
            disabled={!isAdmin}
          />
        </SettingRow>

        <SettingRow label="Active Rule Version" description="Currently applied compliance ruleset version">
          <span className="px-2 py-0.5 bg-primary/10 text-primary text-[11px] font-mono rounded">
            {complianceSettings.rule_version}
          </span>
        </SettingRow>

        <div className="pt-3 border-t border-outline-variant">
          <p className="text-xs font-semibold text-on-surface mb-2">Required Statutory Fields</p>
          <p className="text-[11px] text-on-surface-variant mb-3">
            These fields must be present and legible on all inspected packages.
          </p>
          <div className="space-y-2">
            {STATUTORY_FIELDS.map(field => (
              <label key={field} className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={complianceSettings.required_statutory_fields.includes(field)}
                  disabled={!isAdmin}
                  onChange={e => {
                    if (!isAdmin) return;
                    setComplianceSettings(s => ({
                      ...s,
                      required_statutory_fields: e.target.checked
                        ? [...s.required_statutory_fields, field]
                        : s.required_statutory_fields.filter(f => f !== field),
                    }));
                  }}
                  className="w-4 h-4 rounded border-outline-variant text-primary focus:ring-primary disabled:opacity-50"
                />
                <span className="text-xs text-on-surface">{field}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="bg-surface border border-outline-variant rounded-xl p-6 shadow-xs">
          <h3 className="text-headline-md font-headline-md text-on-surface mb-4">
            Stitch MCP & Platform Integration
          </h3>
          <div className="space-y-3 text-xs text-on-surface-variant">
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-1 py-2 border-b border-outline-variant/60">
              <span className="font-medium text-on-surface shrink-0">Design System Source</span>
              <span className="font-mono text-primary break-all">Google Stitch MCP (Project: 6874572683199449301)</span>
            </div>
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-1 py-2 border-b border-outline-variant/60">
              <span className="font-medium text-on-surface shrink-0">Active Color Theme</span>
              <span>Regulatory Integrity Interface (#1A73E8 / #005BBF)</span>
            </div>
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-1 py-2 border-b border-outline-variant/60">
              <span className="font-medium text-on-surface shrink-0">Typography Engine</span>
              <span>Google Inter • Enterprise Density</span>
            </div>
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-1 py-2">
              <span className="font-medium text-on-surface shrink-0">Rule Codification</span>
              <span>Legal Metrology (Packaged Commodities) Act, 2011</span>
            </div>
          </div>
        </div>
        {!isAdmin && (
          <div className="mt-4 pt-3 border-t border-outline-variant flex items-center gap-2 text-[11px] text-on-surface-variant">
            <span className="material-symbols-outlined text-[14px]">admin_panel_settings</span>
            Admin access required to modify compliance rules.
          </div>
        )}
        </div>
      </div>
      </SectionCard>
    </div>
  );

  const renderReports = () => (
    <SectionCard title="PDF Report Settings" description="Configure what to include in generated compliance reports" icon="description">
      <SettingRow label="PDF Report Format" description="Page size for generated reports">
        <select
          value={reportSettings.pdf_format}
          onChange={e => setReportSettings(s => ({ ...s, pdf_format: e.target.value as 'A4' | 'Letter' }))}
          className="px-3 py-1.5 text-xs bg-surface-container-low border border-outline-variant rounded-lg text-on-surface focus:outline-none focus:ring-2 focus:ring-primary"
        >
          <option value="A4">A4 (International)</option>
          <option value="Letter">Letter (US)</option>
        </select>
      </SettingRow>

      {([
        ['include_front_image', 'Include Front Label Image', 'Embed front label photograph in the PDF'],
        ['include_back_image', 'Include Back Label Image', 'Embed back label photograph in the PDF'],
        ['include_ocr_text', 'Include Raw OCR Text', 'Append full extracted OCR text to report'],
        ['include_extracted_fields', 'Include Extracted Fields', 'Show table of all identified label fields'],
        ['include_compliance_violations', 'Include Compliance Violations', 'List detected regulatory violations with evidence'],
        ['include_confidence_scores', 'Include Confidence Scores', 'Show AI confidence percentages per field'],
        ['include_officer_details', 'Include Officer / User Details', 'Append inspector name and ID to the report'],
      ] as [keyof ReportSettings, string, string][]).map(([key, label, desc]) => (
        <SettingRow key={key} label={label} description={desc}>
          <Toggle
            checked={reportSettings[key] as boolean}
            onChange={v => setReportSettings(s => ({ ...s, [key]: v }))}
          />
        </SettingRow>
      ))}
    </SectionCard>
  );

  const renderNotifications = () => (
    <SectionCard title="Notification Preferences" description="Choose which events trigger in-app notifications" icon="notifications">
      {([
        ['scan_completed', 'Scan Completed', 'Notify when a scan finishes processing'],
        ['compliance_failure', 'Compliance Failure', 'Alert when a package fails statutory checks'],
        ['amber_review_required', 'Amber Review Required', 'Notify when manual review is needed'],
        ['low_ocr_confidence', 'Low OCR Confidence', 'Alert when OCR extraction confidence is low'],
        ['report_generated', 'Report Generated', 'Notify when a PDF report is ready'],
      ] as [keyof NotificationSettings, string, string][]).map(([key, label, desc]) => (
        <SettingRow key={key} label={label} description={desc}>
          <Toggle
            checked={notifSettings[key]}
            onChange={v => setNotifSettings(s => ({ ...s, [key]: v }))}
          />
        </SettingRow>
      ))}
    </SectionCard>
  );

  const renderDataHistory = () => (
    <div className="space-y-4">
      <SectionCard title="Scan History" description="Overview of your inspection data" icon="history">
        <div className="flex items-center gap-4">
          <div className="flex-1 bg-primary/5 border border-primary/20 rounded-xl p-4 text-center">
            <p className="text-2xl font-bold text-primary">
              {inspectionCount === null ? '—' : inspectionCount}
            </p>
            <p className="text-[11px] text-on-surface-variant mt-1">Total Inspections</p>
          </div>
          <div className="flex-1">
            <p className="text-xs text-on-surface-variant mb-2">
              {isSupabaseConnected
                ? 'Connected to Supabase — data is persistent.'
                : 'Demo mode — data is local only.'}
            </p>
            <Button
              variant="secondary"
              size="sm"
              icon="open_in_new"
              onClick={() => window.open('/history', '_blank')}
            >
              View Full History
            </Button>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Export & Manage" icon="database">
        <SettingRow label="Export Inspection History" description="Download all your inspections as a CSV file">
          <Button
            variant="secondary"
            size="sm"
            icon="download"
            disabled={!isSupabaseConnected || exportLoading}
            onClick={handleExportHistory}
          >
            {exportLoading ? 'Exporting…' : 'Export CSV'}
          </Button>
        </SettingRow>

        <div className="pt-4 border-t border-outline-variant mt-4">
          <div className="flex items-start gap-2 mb-3 px-3 py-2 bg-error-container/30 rounded-lg">
            <span className="material-symbols-outlined text-[16px] text-error shrink-0 mt-0.5">warning</span>
            <p className="text-[11px] text-error font-medium">
              <strong>Danger Zone.</strong> Clearing all scan data is permanent and cannot be undone.
            </p>
          </div>
          <SettingRow label="Clear All Scan Data" description="Permanently delete all your inspection records">
            <Button
              variant="danger"
              size="sm"
              icon="delete_forever"
              disabled={isDemo || !isSupabaseConnected}
              onClick={() => { setClearDataModalOpen(true); setClearDataMsg(null); }}
            >
              Clear All Data
            </Button>
          </SettingRow>
          {isDemo && (
            <p className="text-[11px] text-on-surface-variant mt-2">
              Data deletion is disabled in demo mode.
            </p>
          )}
        </div>
      </SectionCard>
    </div>
  );

  const renderSecurity = () => (
    <div className="space-y-4">
      <SectionCard title="Session & Security" icon="lock">
        <InfoRow label="Session Status" value={user ? 'Active' : 'Inactive'} />
        <InfoRow label="Authentication Provider" value={isDemo ? 'Demo (Local)' : 'Supabase Auth'} />
        <InfoRow label="Session Type" value={isDemo ? 'Demo Inspector' : 'Authenticated User'} />
        <InfoRow label="User ID" value={user?.id ? `${user.id.slice(0, 8)}…` : '—'} mono />
        {!isDemo && (
          <div className="mt-4 pt-3 border-t border-outline-variant">
            <Button
              variant="secondary"
              size="sm"
              icon="lock_reset"
              onClick={() => { setPwdModalOpen(true); setPwdMsg(null); }}
            >
              Change Password
            </Button>
          </div>
        )}
      </SectionCard>

      <SectionCard title="Account Activity" icon="timeline">
        <InfoRow label="Last Login" value={new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })} />
        <InfoRow label="Login Method" value={isDemo ? 'Demo Account' : 'Email / Password'} />
        <InfoRow label="Inspector Role" value={user?.role || '—'} />
        <InfoRow label="Department" value={user?.department || '—'} />
      </SectionCard>

      <SectionCard title="Privacy & Audit" icon="policy">
        <InfoRow label="Data Storage" value={isSupabaseConnected ? 'Supabase (Cloud)' : 'Local / Demo'} />
        <InfoRow label="Data Retention" value="As per government data policies" />
        <InfoRow label="Audit Logging" value="Enabled — all scans are tracked" />
        <InfoRow label="Data Encryption" value="AES-256 at rest, TLS 1.3 in transit" />
        <div className="mt-4 pt-3 border-t border-outline-variant flex gap-3">
          <button
            onClick={() => window.open('/privacy', '_blank')}
            className="text-xs text-primary hover:underline flex items-center gap-1"
          >
            <span className="material-symbols-outlined text-[14px]">open_in_new</span>
            Privacy Policy
          </button>
          <button
            onClick={() => window.open('/terms', '_blank')}
            className="text-xs text-primary hover:underline flex items-center gap-1"
          >
            <span className="material-symbols-outlined text-[14px]">open_in_new</span>
            Terms of Service
          </button>
        </div>
      </SectionCard>
    </div>
  );

  const renderSystem = () => (
    <div className="space-y-4">
      <SectionCard title="System Information" icon="info">
        <InfoRow label="PackIntel Version" value="v2.0.0 (SIH 2026)" />
        <InfoRow label="OCR Engine" value="Google Cloud Vision API" />
        <InfoRow label="Compliance Rules" value="Legal Metrology (PC) Act, 2011 · v3.2" />
        <InfoRow label="Rule Codification" value="Legal Metrology (Packaged Commodities) Act, 2011" />
        <InfoRow label="AI Model" value="Gemini 2.0 Flash (Google)" />
        <InfoRow label="Frontend Framework" value="Next.js 14 (App Router)" />
        <InfoRow label="Build Target" value="Web — Desktop & Mobile" />
      </SectionCard>

      <SectionCard title="Service Status" icon="cloud">
        <InfoRow label="Backend / API" value={apiOnline === null ? '…' : <StatusDot online={apiOnline} />} />
        <InfoRow label="Database (Supabase)" value={dbOnline === null ? '…' : <StatusDot online={!!dbOnline} />} />
        <InfoRow label="Supabase Configured" value={isSupabaseConnected ? 'Yes' : 'No (Demo Mode)'} />
        {isSupabaseConnected && (
          <InfoRow
            label="Project URL"
            value={process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/rest\/v1\/?$/, '') || '—'}
            mono
          />
        )}
      </SectionCard>

      <SectionCard title="Stitch MCP & Platform Integration" icon="palette">
        <InfoRow label="Design System Source" value="Google Stitch MCP (Project: 6874572683199449301)" mono />
        <InfoRow label="Active Color Theme" value="Regulatory Integrity Interface (#1A73E8 / #005BBF)" />
        <InfoRow label="Typography Engine" value="Google Inter • Enterprise Density" />
        <InfoRow label="Rule Codification" value="Legal Metrology (Packaged Commodities) Act, 2011" />
      </SectionCard>
    </div>
  );

  const tabContent: Record<TabId, React.ReactNode> = {
    profile: renderProfile(),
    scan_ocr: renderScanOCR(),
    compliance: renderCompliance(),
    reports: renderReports(),
    notifications: renderNotifications(),
    data_history: renderDataHistory(),
    security: renderSecurity(),
    system: renderSystem(),
  };

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <AppShell pageTitle="Settings">
      {/* Page Header */}
      <div className="mb-6">
        <h2 className="text-display-lg-mobile md:text-display-lg font-display-lg text-on-surface mb-1">
          Settings
        </h2>
        <p className="text-body-base font-body-base text-on-surface-variant">
          Manage your PackIntel account, OCR settings, compliance rules, and preferences.
        </p>
      </div>

      <div className="flex flex-col lg:flex-row gap-6">
        {/* ── Sidebar Navigation ─────────────────────────────────────────── */}
        <aside className="lg:w-56 shrink-0">
          {/* Mobile: horizontal scroll tabs */}
          <div className="lg:hidden overflow-x-auto pb-2 -mx-4 px-4">
            <div className="flex gap-2 w-max">
              {TABS.map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
                    activeTab === tab.id
                      ? 'bg-primary text-on-primary shadow-sm'
                      : 'bg-surface border border-outline-variant text-on-surface-variant hover:bg-surface-container-low'
                  }`}
                >
                  <span className="material-symbols-outlined text-[15px]">{tab.icon}</span>
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* Desktop: vertical sidebar */}
          <nav className="hidden lg:block bg-surface border border-outline-variant rounded-xl shadow-xs overflow-hidden">
            {TABS.map((tab, i) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`w-full flex items-center gap-3 px-4 py-3 text-left text-xs font-semibold transition-colors ${
                  i > 0 ? 'border-t border-outline-variant/50' : ''
                } ${
                  activeTab === tab.id
                    ? 'bg-primary/8 text-primary border-l-2 border-primary pl-[14px]'
                    : 'text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface'
                }`}
              >
                <span className={`material-symbols-outlined text-[18px] ${activeTab === tab.id ? 'text-primary' : ''}`}>
                  {tab.icon}
                </span>
                {tab.label}
              </button>
            ))}
          </nav>
        </aside>

        {/* ── Main Content ───────────────────────────────────────────────── */}
        <div className="flex-1 min-w-0">
          {tabContent[activeTab]}

          {/* Save button — shown for saveable tabs */}
          {(['scan_ocr', 'compliance', 'reports', 'notifications'] as TabId[]).includes(activeTab) && (
            <div className="flex justify-end gap-3 pt-4 mt-2">
              <Button variant="primary" icon="save" onClick={handleSave}>
                Save Settings
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* ── Save Banner ─────────────────────────────────────────────────── */}
      <SaveBanner saved={saved} />

      {/* ── Change Password Modal ────────────────────────────────────────── */}
      <Modal
        isOpen={pwdModalOpen}
        onClose={() => { setPwdModalOpen(false); setPwdMsg(null); setNewPassword(''); setConfirmPassword(''); }}
        title="Change Password"
        subtitle="Enter a new password for your PackIntel account."
        maxWidth="sm"
        footer={
          <>
            <Button variant="outline" size="sm" onClick={() => setPwdModalOpen(false)}>Cancel</Button>
            <Button variant="primary" size="sm" icon="lock_reset" onClick={handlePasswordChange} disabled={pwdSaving}>
              {pwdSaving ? 'Saving…' : 'Update Password'}
            </Button>
          </>
        }
      >
        {pwdMsg && (
          <div className={`mb-3 px-3 py-2 rounded-lg text-xs font-medium ${pwdMsg.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-error-container text-on-error-container border border-error/20'}`}>
            {pwdMsg.text}
          </div>
        )}
        <div className="space-y-3">
          <div>
            <label className="block text-[11px] font-semibold text-on-surface-variant uppercase tracking-wide mb-1">New Password</label>
            <input
              type="password"
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              placeholder="Minimum 6 characters"
              className="w-full px-3 py-2 text-sm bg-surface-container-low border border-outline-variant rounded-lg text-on-surface focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-on-surface-variant uppercase tracking-wide mb-1">Confirm New Password</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              placeholder="Repeat new password"
              className="w-full px-3 py-2 text-sm bg-surface-container-low border border-outline-variant rounded-lg text-on-surface focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
        </div>
      </Modal>

      {/* ── Logout Confirm Modal ─────────────────────────────────────────── */}
      <Modal
        isOpen={logoutModalOpen}
        onClose={() => setLogoutModalOpen(false)}
        title="Sign Out"
        subtitle="You will be returned to the login page."
        maxWidth="sm"
        footer={
          <>
            <Button variant="outline" size="sm" onClick={() => setLogoutModalOpen(false)}>Cancel</Button>
            <Button variant="danger" size="sm" icon="logout" onClick={() => { setLogoutModalOpen(false); signOut(); }}>
              Sign Out
            </Button>
          </>
        }
      >
        <p className="text-xs text-on-surface-variant">
          Are you sure you want to sign out of PackIntel? Any unsaved settings will be lost.
        </p>
      </Modal>

      {/* ── Clear All Data Modal ─────────────────────────────────────────── */}
      <Modal
        isOpen={clearDataModalOpen}
        onClose={() => { setClearDataModalOpen(false); setClearDataConfirm(''); setClearDataMsg(null); }}
        title="Clear All Scan Data"
        subtitle="This action cannot be undone."
        maxWidth="sm"
        footer={
          <>
            <Button variant="outline" size="sm" onClick={() => setClearDataModalOpen(false)}>Cancel</Button>
            <Button
              variant="danger"
              size="sm"
              icon="delete_forever"
              disabled={clearDataLoading || clearDataConfirm !== 'DELETE ALL'}
              onClick={handleClearAllData}
            >
              {clearDataLoading ? 'Deleting…' : 'Delete All'}
            </Button>
          </>
        }
      >
        {clearDataMsg && (
          <div className={`mb-3 px-3 py-2 rounded-lg text-xs font-medium ${clearDataMsg.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-error-container text-on-error-container border border-error/20'}`}>
            {clearDataMsg.text}
          </div>
        )}
        <div className="space-y-3">
          <div className="flex items-start gap-2 p-3 bg-error-container/30 rounded-lg">
            <span className="material-symbols-outlined text-[18px] text-error shrink-0">warning</span>
            <p className="text-xs text-error">
              This will permanently delete all <strong>{inspectionCount ?? 0}</strong> inspection records from your account. This cannot be reversed.
            </p>
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-on-surface-variant uppercase tracking-wide mb-1">
              Type <span className="font-mono text-error">DELETE ALL</span> to confirm
            </label>
            <input
              type="text"
              value={clearDataConfirm}
              onChange={e => setClearDataConfirm(e.target.value)}
              placeholder="DELETE ALL"
              className="w-full px-3 py-2 text-sm bg-surface-container-low border border-outline-variant rounded-lg text-on-surface focus:outline-none focus:ring-2 focus:ring-error"
            />
          </div>
        </div>
      </Modal>
    </AppShell>
  );
}
