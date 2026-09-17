import React, { useState, useEffect } from 'react';
import {
  GitBranch,
  GitCommit,
  GitPullRequest,
  UploadCloud,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Copy,
  Check,
  ExternalLink,
  X,
  Key,
  FolderGit2,
  Terminal,
} from 'lucide-react';

interface GitHubSyncModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface GitStatus {
  isGitRepo: boolean;
  branch: string;
  clean: boolean;
  remoteUrl: string;
  lastCommit: {
    hash: string;
    message: string;
    date: string;
  };
  modifiedFiles: string[];
}

export const GitHubSyncModal: React.FC<GitHubSyncModalProps> = ({ isOpen, onClose }) => {
  const [status, setStatus] = useState<GitStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [commitMessage, setCommitMessage] = useState('Update AuraVision DAW tracks & arrangement');
  const [remoteUrl, setRemoteUrl] = useState('');
  const [token, setToken] = useState('');
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [copiedCmd, setCopiedCmd] = useState(false);

  const fetchStatus = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/git/status');
      const data = await res.json();
      if (data.success) {
        setStatus(data);
        if (data.remoteUrl && !remoteUrl) {
          setRemoteUrl(data.remoteUrl);
        }
      }
    } catch (err: any) {
      setFeedback({ type: 'error', message: 'Failed to fetch git status: ' + err.message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchStatus();
      setFeedback(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleCommit = async () => {
    if (!commitMessage.trim()) return;
    setLoading(true);
    setFeedback(null);
    try {
      const res = await fetch('/api/git/commit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: commitMessage }),
      });
      const data = await res.json();
      if (data.success) {
        setFeedback({ type: 'success', message: 'Successfully committed changes to local branch!' });
        await fetchStatus();
      } else {
        setFeedback({ type: 'error', message: data.error || 'Commit failed.' });
      }
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message });
    } finally {
      setLoading(false);
    }
  };

  const handleSetRemote = async () => {
    if (!remoteUrl.trim()) return;
    setLoading(true);
    setFeedback(null);
    try {
      const res = await fetch('/api/git/remote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ remoteUrl: remoteUrl.trim() }),
      });
      const data = await res.json();
      if (data.success) {
        setFeedback({ type: 'success', message: 'Remote origin updated to ' + data.remoteUrl });
        await fetchStatus();
      } else {
        setFeedback({ type: 'error', message: data.error || 'Failed to set remote.' });
      }
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message });
    } finally {
      setLoading(false);
    }
  };

  const handlePush = async () => {
    setLoading(true);
    setFeedback(null);
    try {
      const res = await fetch('/api/git/push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          remoteUrl: remoteUrl.trim() || undefined,
          token: token.trim() || undefined,
          branch: status?.branch || 'main',
        }),
      });
      const data = await res.json();
      if (data.success) {
        setFeedback({
          type: 'success',
          message: data.message || 'Pushed successfully to GitHub!',
        });
        await fetchStatus();
      } else {
        setFeedback({
          type: 'error',
          message: data.error || 'Push failed. Please check permissions.',
        });
      }
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message });
    } finally {
      setLoading(false);
    }
  };

  const cliCommands = `git remote add origin ${remoteUrl || 'https://github.com/YOUR_USERNAME/YOUR_REPO.git'}\ngit branch -M main\ngit push -u origin main`;

  const copyCli = () => {
    navigator.clipboard.writeText(cliCommands);
    setCopiedCmd(true);
    setTimeout(() => setCopiedCmd(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150 select-none">
      <div className="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/60">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-100 shadow-inner">
              <FolderGit2 className="w-5 h-5 text-sky-400" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <span>GitHub Repository & Sync</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-sky-950 text-sky-400 border border-sky-800/80">
                  {status?.branch || 'main'}
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Synchronize AuraVision DAW project, soundbanks, and audio code with GitHub
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-5 text-xs text-slate-300">
          {/* Status Banner */}
          {feedback && (
            <div
              className={`p-3.5 rounded-xl border flex items-start gap-2.5 ${
                feedback.type === 'success'
                  ? 'bg-emerald-950/50 border-emerald-800/80 text-emerald-200'
                  : 'bg-rose-950/50 border-rose-800/80 text-rose-200'
              }`}
            >
              {feedback.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400 mt-0.5 flex-shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 text-rose-400 mt-0.5 flex-shrink-0" />
              )}
              <span className="leading-relaxed">{feedback.message}</span>
            </div>
          )}

          {/* Local Repository Status Card */}
          <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-slate-200 flex items-center gap-1.5">
                <GitBranch className="w-4 h-4 text-sky-400" />
                Repository Snapshot
              </span>
              <button
                onClick={fetchStatus}
                disabled={loading}
                className="text-[11px] text-slate-400 hover:text-slate-200 flex items-center gap-1 cursor-pointer"
              >
                <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
                <span>Refresh</span>
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2 text-[11px]">
              <div className="bg-slate-900/80 p-2.5 rounded-lg border border-slate-800">
                <div className="text-slate-400 text-[10px] uppercase font-mono">Current Branch</div>
                <div className="text-sky-300 font-mono font-bold mt-0.5">
                  {status?.branch || 'main'}
                </div>
              </div>
              <div className="bg-slate-900/80 p-2.5 rounded-lg border border-slate-800">
                <div className="text-slate-400 text-[10px] uppercase font-mono">Working Tree</div>
                <div
                  className={`font-semibold mt-0.5 flex items-center gap-1 ${
                    status?.clean ? 'text-emerald-400' : 'text-amber-400'
                  }`}
                >
                  {status?.clean ? (
                    <>
                      <CheckCircle2 className="w-3 h-3" />
                      <span>Clean & Ready</span>
                    </>
                  ) : (
                    <>
                      <AlertCircle className="w-3 h-3" />
                      <span>{status?.modifiedFiles.length || 0} modified files</span>
                    </>
                  )}
                </div>
              </div>
            </div>

            {status?.lastCommit?.hash && (
              <div className="bg-slate-900/60 p-2.5 rounded-lg border border-slate-800/80 flex items-start gap-2 text-[11px]">
                <GitCommit className="w-4 h-4 text-slate-400 mt-0.5 flex-shrink-0" />
                <div className="overflow-hidden">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sky-400 font-bold">
                      {status.lastCommit.hash}
                    </span>
                    <span className="text-slate-200 truncate font-medium">
                      {status.lastCommit.message}
                    </span>
                  </div>
                  {status.lastCommit.date && (
                    <div className="text-[10px] text-slate-400 mt-0.5 font-mono">
                      {status.lastCommit.date}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Quick Commit & Snapshot */}
          <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2.5">
            <label className="font-semibold text-slate-200 flex items-center gap-1.5">
              <GitCommit className="w-4 h-4 text-cyan-400" />
              Commit Workspace Changes
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={commitMessage}
                onChange={(e) => setCommitMessage(e.target.value)}
                placeholder="Commit message..."
                className="flex-1 bg-slate-900 border border-slate-700/80 rounded-lg px-3 py-2 text-xs text-slate-100 outline-none focus:border-sky-500 font-mono"
              />
              <button
                onClick={handleCommit}
                disabled={loading || !commitMessage.trim()}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-100 font-medium rounded-lg border border-slate-600 transition-colors disabled:opacity-50 cursor-pointer flex items-center gap-1.5 flex-shrink-0"
              >
                <GitCommit className="w-3.5 h-3.5" />
                <span>Commit</span>
              </button>
            </div>
          </div>

          {/* Remote Sync & Push */}
          <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
            <label className="font-semibold text-slate-200 flex items-center gap-1.5">
              <UploadCloud className="w-4 h-4 text-sky-400" />
              GitHub Remote Repository & Push
            </label>

            <div className="space-y-2">
              <div>
                <div className="text-[10px] text-slate-400 uppercase font-mono mb-1">
                  GitHub Repository URL (HTTPS)
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={remoteUrl}
                    onChange={(e) => setRemoteUrl(e.target.value)}
                    placeholder="https://github.com/your-username/your-repo.git"
                    className="flex-1 bg-slate-900 border border-slate-700/80 rounded-lg px-3 py-2 text-xs text-slate-100 outline-none focus:border-sky-500 font-mono"
                  />
                  <button
                    onClick={handleSetRemote}
                    disabled={loading || !remoteUrl.trim()}
                    className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg border border-slate-700 transition-colors text-xs flex-shrink-0 cursor-pointer"
                  >
                    Set Origin
                  </button>
                </div>
              </div>

              <div>
                <div className="text-[10px] text-slate-400 uppercase font-mono mb-1 flex items-center gap-1">
                  <Key className="w-3 h-3 text-amber-400" />
                  <span>GitHub Personal Access Token (PAT)</span>
                  <span className="text-slate-400 lowercase">(for direct push auth)</span>
                </div>
                <input
                  type="password"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  placeholder="ghp_xxxxxxxxxxxxxxxxxxxx (Requires 'repo' permissions)"
                  className="w-full bg-slate-900 border border-slate-700/80 rounded-lg px-3 py-2 text-xs text-slate-100 outline-none focus:border-sky-500 font-mono"
                />
              </div>

              <div className="pt-1 flex items-center justify-between">
                <span className="text-[11px] text-slate-400">
                  Pushes current project state to branch <code className="text-sky-300">main</code>
                </span>
                <button
                  onClick={handlePush}
                  disabled={loading || !remoteUrl.trim()}
                  className="px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white font-semibold rounded-lg shadow-lg shadow-sky-600/30 transition-all flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
                >
                  <UploadCloud className="w-4 h-4" />
                  <span>{loading ? 'Syncing...' : 'Push to GitHub'}</span>
                </button>
              </div>
            </div>
          </div>

          {/* Native AI Studio 1-Click Export Callout */}
          <div className="p-3.5 rounded-xl bg-slate-850 border border-slate-700/60 flex items-start gap-3">
            <div className="p-2 rounded-lg bg-indigo-950 border border-indigo-800 text-indigo-400 mt-0.5">
              <ExternalLink className="w-4 h-4" />
            </div>
            <div>
              <div className="font-semibold text-slate-200">Google AI Studio Direct GitHub Export</div>
              <p className="text-[11px] text-slate-400 mt-0.5 leading-relaxed">
                You can also sync directly to your connected GitHub account anytime using the AI Studio top Settings menu ⚙️ ➔ <strong>Export to GitHub</strong>.
              </p>
            </div>
          </div>

          {/* Terminal Manual Command Snippet */}
          <div className="p-3 rounded-xl bg-slate-950 border border-slate-800/80 font-mono text-[11px]">
            <div className="flex items-center justify-between text-slate-400 pb-1.5 border-b border-slate-800 mb-2">
              <span className="flex items-center gap-1.5">
                <Terminal className="w-3.5 h-3.5 text-slate-400" />
                CLI Git Commands
              </span>
              <button
                onClick={copyCli}
                className="hover:text-slate-200 flex items-center gap-1 text-[10px] cursor-pointer"
              >
                {copiedCmd ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                <span>{copiedCmd ? 'Copied' : 'Copy'}</span>
              </button>
            </div>
            <pre className="text-slate-300 overflow-x-auto whitespace-pre leading-relaxed">
              {cliCommands}
            </pre>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 border-t border-slate-800 bg-slate-950/80 flex items-center justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-medium transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
