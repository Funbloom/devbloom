"use client";

import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { API_BASE } from "../../lib/api";
import { isLocalAgentContext, localAgent, localAgentDownloadUrl, localAgentWebInstallUrl, fetchLocalAgentLatestVersion, getCachedLocalAgentInstalledVersion, setCachedLocalAgentInstalledVersion, isPythonVersion310Plus, PYTHON_WINDOWS_INSTALLER_URL, type LocalAgentInfo, type LocalModelsInstallationStatus } from "../../lib/localAgentClient";

type InstallTab = "basic" | "advanced";

type StatusState = "checking" | "ok" | "missing" | "unknown";
type ActionResultState = "success" | "error";
type InstructionTopic =
  | "local_agent"
  | "api_server"
  | "python"
  | "pytorch"
  | "cuda"
  | "hf_home"
  | "hunyuan"
  | "hunyuan_texture"
  | "sam";

function StatusLine({
  label,
  purpose,
  state,
  detail,
  action,
}: {
  label: string;
  /** One-line explanation of why this component matters for the app. */
  purpose?: string;
  state: StatusState;
  detail: string;
  action?: ReactNode;
}) {
  const color =
    state === "ok" ? "#22c55e" : state === "missing" ? "#ef4444" : state === "checking" ? "#f59e0b" : "#94a3b8";
  return (
    <div
      style={{
        border: "1px solid #2a2f3a",
        borderRadius: 10,
        padding: "10px 12px",
        display: "grid",
        gap: 6,
        background: "#0f1115",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span
            aria-hidden
            style={{ width: 10, height: 10, borderRadius: "50%", background: color, flexShrink: 0 }}
          />
          <strong style={{ fontSize: 14 }}>{label}</strong>
        </div>
        {action}
      </div>
      {purpose ? (
        <p style={{ margin: 0, color: "var(--muted, #94a3b8)", fontSize: 12, lineHeight: 1.4 }}>{purpose}</p>
      ) : null}
      <p style={{ margin: 0, color: "var(--muted, #94a3b8)", fontSize: 13 }}>{detail}</p>
    </div>
  );
}
export default function AdminInstallationPage() {
  const [pythonBasicState, setPythonBasicState] = useState<StatusState>("checking");
  const [pythonBasicDetail, setPythonBasicDetail] = useState("Checking Python...");
  const [localAgentState, setLocalAgentState] = useState<StatusState>("checking");
  const [apiServerState, setApiServerState] = useState<StatusState>("checking");
  const [samState, setSamState] = useState<StatusState>("checking");
  const [samDetail, setSamDetail] = useState("Checking SAM installation...");
  const [hunyuanState, setHunyuanState] = useState<StatusState>("checking");
  const [hunyuanDetail, setHunyuanDetail] = useState("Checking Hunyuan3D-2 installation...");
  const [pytorchState, setPytorchState] = useState<StatusState>("checking");
  const [pythonState, setPythonState] = useState<StatusState>("checking");
  const [pythonDetail, setPythonDetail] = useState("Checking Python version...");
  const [cudaState, setCudaState] = useState<StatusState>("checking");
  const [cudaDetail, setCudaDetail] = useState("Checking CUDA availability...");
  const [hfHomeState, setHfHomeState] = useState<StatusState>("checking");
  const [hfHomeDetail, setHfHomeDetail] = useState("Checking HF_HOME...");
  const [textureExtState, setTextureExtState] = useState<StatusState>("checking");
  const [textureExtDetail, setTextureExtDetail] = useState("Checking texture extensions...");
  const [installingTextureExt, setInstallingTextureExt] = useState(false);
  const [textureInstallResult, setTextureInstallResult] = useState<{
    state: ActionResultState;
    message: string;
    at: string;
  } | null>(null);
  const [lastTextureInstallLog, setLastTextureInstallLog] = useState<string>("");
  const [instructionTopic, setInstructionTopic] = useState<InstructionTopic | null>(null);
  const [agentInfo, setAgentInfo] = useState<LocalAgentInfo | null>(null);
  const [latestVersion, setLatestVersion] = useState<string | null>(null);
  const [cachedInstalledVersion, setCachedInstalledVersion] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<InstallTab>("basic");
  const downloadUrl = localAgentDownloadUrl();
  const webInstallUrl = localAgentWebInstallUrl();

  const installedVersion = agentInfo?.version || cachedInstalledVersion;
  const isInstalledOnDisk = Boolean(installedVersion);
  const updateAvailable = Boolean(
    latestVersion && installedVersion && latestVersion !== installedVersion,
  );
  const showInstallButton = !isInstalledOnDisk || updateAvailable;
  const agentRunning = localAgentState === "ok";
  /** Installed: Install uses URL protocol (re-runs web-install.bat). First time: download zip + bat. */
  const installViaProtocol = isInstalledOnDisk;

  function triggerInstallDownloads(): void {
    if (!downloadUrl || !webInstallUrl) {
      return;
    }
    const zipLink = document.createElement("a");
    zipLink.href = downloadUrl;
    zipLink.download = "latest.zip";
    zipLink.rel = "noreferrer";
    document.body.appendChild(zipLink);
    zipLink.click();
    document.body.removeChild(zipLink);
    window.setTimeout(() => {
      const batLink = document.createElement("a");
      batLink.href = webInstallUrl;
      batLink.download = "DevBloom-LocalAgent-Install.bat";
      batLink.rel = "noreferrer";
      document.body.appendChild(batLink);
      batLink.click();
      document.body.removeChild(batLink);
    }, 400);
  }

  const actionButtonStyle: React.CSSProperties = {
    fontSize: 13,
    padding: "6px 12px",
    borderRadius: 8,
    border: "1px solid #475569",
    background: "#1e293b",
    color: "var(--color-text, #f1f5f9)",
    textDecoration: "none",
    cursor: "pointer",
  };

  const tabButtonStyle = (active: boolean): React.CSSProperties => ({
    padding: "8px 16px",
    borderRadius: 8,
    border: active ? "1px solid #64748b" : "1px solid #334155",
    background: active ? "#1e293b" : "transparent",
    color: active ? "#f1f5f9" : "#94a3b8",
    cursor: "pointer",
    fontSize: 14,
    fontWeight: active ? 600 : 400,
  });

  const instructionByTopic: Record<InstructionTopic, { title: string; body: string }> = {
    local_agent: {
      title: "Local Agent",
      body:
        "Windows (artists):\n" +
        "1. Settings → Installation → Basic → Install.\n" +
        "2. Open your Downloads folder and run DevBloom-LocalAgent-Install.bat.\n" +
        "3. Click Run. Use Stop when finished.\n" +
        "\n" +
        "Developers (full repo):\n" +
        "- Clone https://github.com/FunBloomStudio/devbloom.git\n" +
        "- From repo root run local_agent\\run.bat (Windows) or local_agent/run.sh (macOS).\n" +
        "- Requires Python 3.10+ and root requirements.txt in .venv.",
    },
    api_server: {
      title: "API Server",
      body:
        "API Server is running on AWS at http://dev.funbloomstudio.com/ so you don't need to install it. But you can also install it locally by following the instructions below." +
        "- Clone the repository from https://github.com/FunBloomStudio/devbloom.git\n" +
        "- Open a terminal in api folder.\n" +
        "- Start API with your run command (run.bat / uvicorn).\n" +
        "- Verify: http://localhost:8000/health returns OK.\n" +
        "Run WebServer locally: \n" +
        "- Clone the repository from https://github.com/FunBloomStudio/devbloom.git\n" +
        "- Open a terminal at repo root.\n" +
        "- Run: cd web\n" +
        "- Start: npm install\n" +
        "- Start: npm run dev\n" +
        "- Open the browser and navigate to http://localhost:3000\n",
    },
    python: {
      title: "Python 3.10.x",
      body:
        "- Install Python 3.10.x (any 3.10 patch).\n" +
        "- Recreate the root .venv with Python 3.10.\n" +
        "- Restart local agent.",
    },
    pytorch: {
      title: "PyTorch",
      body:
        "- Activate the root .venv (shared by api and local_agent).\n" +
        "- Install torch/vision/audio for your CUDA build.\n" +
        "- Example: pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu124",
    },
    cuda: {
      title: "CUDA",
      body:
        "- Install NVIDIA driver + CUDA toolkit compatible with PyTorch.\n" +
        "- Minor CUDA mismatch can still work.\n" +
        "- Verify in venv: torch.cuda.is_available() is true.",
    },
    hf_home: {
      title: "HF_HOME",
      body:
        "- Set HF_HOME in local_agent/.env.\n" +
        "- Example: D:/FunBloom/models/hf_cache\n" +
        "- Ensure folder exists and is writable.",
    },
    hunyuan: {
      title: "Hunyuan3D-2",
      body:
        "- Activate the root .venv.\n" +
        "- Install editable from clone: pip install -e <Hunyuan3D-2 path>\n" +
        "- Verify import in the same venv.",
    },
    hunyuan_texture: {
      title: "Hunyuan Texture Extensions",
      body:
        "- Option A: click Install Hunyuan texture.\n" +
        "- Option B manual build in Hunyuan repo:\n" +
        "  - hy3dgen/texgen/custom_rasterizer -> python setup.py install\n" +
        "  - hy3dgen/texgen/differentiable_renderer -> python setup.py install\n" +
        "- Use the same root .venv.",
    },
    sam: {
      title: "SAM Model",
      body:
        "- Install segment_anything deps in the root .venv (pip install -r local_agent/requirements-sam.txt).\n" +
        "- Set SAM_CHECKPOINT_PATH in local_agent/.env.\n" +
        "- Ensure checkpoint file exists at the exact path.",
    },
  };

  const instructionAction = (topic: InstructionTopic) => (
    <button type="button" onClick={() => setInstructionTopic(topic)}>
      Installation Instructions
    </button>
  );

  useEffect(() => {
    if (!instructionTopic) {
      return;
    }
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setInstructionTopic(null);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [instructionTopic]);

  useEffect(() => {
    setCachedInstalledVersion(getCachedLocalAgentInstalledVersion());
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const params = new URLSearchParams(window.location.search);
    const v = params.get("agentInstalled")?.trim();
    if (v) {
      setCachedLocalAgentInstalledVersion(v);
      setCachedInstalledVersion(v);
    }
  }, []);

  useEffect(() => {
    if (!isLocalAgentContext()) {
      return;
    }
    let cancelled = false;
    void (async () => {
      const latest = await fetchLocalAgentLatestVersion();
      if (!cancelled) {
        setLatestVersion(latest);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setLocalAgentState("checking");
      setApiServerState("checking");
      setSamState("checking");
      setSamDetail("Checking SAM installation...");
      setHunyuanState("checking");
      setHunyuanDetail("Checking Hunyuan3D-2 installation...");
      setPytorchState("checking");
      setPythonState("checking");
      setPythonDetail("Checking Python version...");
      setCudaState("checking");
      setCudaDetail("Checking CUDA availability...");
      setHfHomeState("checking");
      setHfHomeDetail("Checking HF_HOME...");
      setTextureExtState("checking");
      setTextureExtDetail("Checking texture extensions...");
      setPythonBasicState("checking");
      setPythonBasicDetail("Checking Python...");
      setAgentInfo(null);

      const localContext = isLocalAgentContext();
      if (!localContext) {
        if (!cancelled) {
          setPythonBasicState("unknown");
          setPythonBasicDetail("Not available on this host.");
          setLocalAgentState("unknown");
          setSamState("unknown");
          setSamDetail("Local Agent checks are disabled on this host.");
          setHunyuanState("unknown");
          setHunyuanDetail("Local Agent checks are disabled on this host.");
          setPytorchState("unknown");
          setPythonState("unknown");
          setPythonDetail("Local Agent checks are disabled on this host.");
          setCudaState("unknown");
          setCudaDetail("Local Agent checks are disabled on this host.");
          setHfHomeState("unknown");
          setHfHomeDetail("Local Agent checks are disabled on this host.");
          setTextureExtState("unknown");
          setTextureExtDetail("Local Agent checks are disabled on this host.");
        }
      } else {
        const localOk = await localAgent.health();
        if (!cancelled) {
          setLocalAgentState(localOk ? "ok" : "missing");
        }
        if (localOk) {
          try {
            const sam: LocalModelsInstallationStatus = await localAgent.installationStatus();
            if (!cancelled) {
              const pyOk = isPythonVersion310Plus(sam.python_version);
              setPythonBasicState(pyOk ? "ok" : "missing");
              setPythonBasicDetail(
                pyOk
                  ? `Installed (${sam.python_version}).`
                  : `Found ${sam.python_version}; need Python 3.10 or newer.`,
              );
            }
          } catch {
            if (!cancelled) {
              setPythonBasicState("unknown");
              setPythonBasicDetail("Could not read Python version from Local Agent.");
            }
          }
          try {
            const info = await localAgent.agentInfo();
            if (!cancelled) {
              setAgentInfo(info);
              if (info.version) {
                setCachedLocalAgentInstalledVersion(info.version);
                setCachedInstalledVersion(info.version);
              }
            }
          } catch {
            if (!cancelled) {
              setAgentInfo(null);
            }
          }
          try {
            const sam: LocalModelsInstallationStatus = await localAgent.installationStatus();
            if (!cancelled) {
              setHunyuanState(sam.hunyuan3d2_installed ? "ok" : "missing");
              setHunyuanDetail(
                sam.hunyuan3d2_installed
                  ? "Installed (hy3dgen import available)."
                  : "Not installed. Install Hunyuan3D-2 in the root .venv.",
              );
              setPytorchState(sam.pytorch_installed ? "ok" : "missing");
              setCudaState(sam.cuda_available ? "ok" : "missing");
              setCudaDetail(
                sam.cuda_available
                  ? `Available${sam.gpu_name ? ` (${sam.gpu_name})` : ""}${sam.cuda_version ? `, CUDA ${sam.cuda_version}` : ""}.`
                  : "Not available. Install CUDA-compatible PyTorch/GPU runtime.",
              );
              const hfOk = sam.hf_home_set && sam.hf_home_exists && sam.hf_home_writable;
              setHfHomeState(hfOk ? "ok" : "missing");
              const hfMissing: string[] = [];
              if (!sam.hf_home_set) hfMissing.push("HF_HOME not set");
              if (sam.hf_home_set && !sam.hf_home_exists) hfMissing.push("HF_HOME path not found");
              if (sam.hf_home_exists && !sam.hf_home_writable) hfMissing.push("HF_HOME not writable");
              setHfHomeDetail(hfMissing.length === 0 ? "Configured and writable." : `Missing: ${hfMissing.join(", ")}.`);
              const textureOk = sam.custom_rasterizer_installed && sam.differentiable_renderer_installed;
              setTextureExtState(textureOk ? "ok" : "missing");
              const textureMissing: string[] = [];
              if (!sam.custom_rasterizer_installed) textureMissing.push("custom_rasterizer");
              if (!sam.differentiable_renderer_installed) textureMissing.push("differentiable_renderer");
              setTextureExtDetail(
                textureMissing.length === 0
                  ? "Installed (needed for textured mesh generation)."
                  : `Missing: ${textureMissing.join(", ")} (only required for texturing).`,
              );
              setPythonState(isPythonVersion310Plus(sam.python_version) ? "ok" : "missing");
              setPythonDetail(
                isPythonVersion310Plus(sam.python_version)
                  ? `Installed (${sam.python_version}).`
                  : `Found ${sam.python_version}; need Python 3.10 or newer.`,
              );
              if (sam.installed) {
                setSamState("ok");
                setSamDetail("Installed and ready.");
              } else {
                setSamState("missing");
                const missing: string[] = [];
                if (!sam.torch_installed) missing.push("torch");
                if (!sam.segment_anything_installed) missing.push("segment_anything");
                if (!sam.sam_checkpoint_path_set) missing.push("SAM_CHECKPOINT_PATH");
                if (sam.sam_checkpoint_path_set && !sam.sam_checkpoint_exists) missing.push("checkpoint file");
                setSamDetail(
                  missing.length > 0 ? `Missing: ${missing.join(", ")}.` : "SAM is not fully configured.",
                );
              }
            }
          } catch {
            if (!cancelled) {
              setSamState("unknown");
              setSamDetail("Could not read SAM status from Local Agent.");
              setHunyuanState("unknown");
              setHunyuanDetail("Could not read Hunyuan3D-2 status from Local Agent.");
              setPytorchState("unknown");
              setPythonState("unknown");
              setPythonDetail("Could not read Python status from Local Agent.");
              setCudaState("unknown");
              setCudaDetail("Could not read CUDA status from Local Agent.");
              setHfHomeState("unknown");
              setHfHomeDetail("Could not read HF_HOME status from Local Agent.");
              setTextureExtState("unknown");
              setTextureExtDetail("Could not read texture extension status from Local Agent.");
            }
          }
        } else if (!cancelled) {
          setPythonBasicState("missing");
          setPythonBasicDetail(
            "Python 3.10+ is required on your PC before installing the Local Agent. Install Python, then run Install.",
          );
          setSamState("unknown");
          setSamDetail("Start Local Agent first, then SAM status can be checked.");
          setHunyuanState("unknown");
          setHunyuanDetail("Start Local Agent first, then Hunyuan3D-2 status can be checked.");
          setPytorchState("unknown");
          setPythonState("unknown");
          setPythonDetail("Start Local Agent first, then Python version can be checked.");
          setCudaState("unknown");
          setCudaDetail("Start Local Agent first, then CUDA status can be checked.");
          setHfHomeState("unknown");
          setHfHomeDetail("Start Local Agent first, then HF_HOME status can be checked.");
          setTextureExtState("unknown");
          setTextureExtDetail("Start Local Agent first, then texture extension status can be checked.");
        }
      }

      try {
        const base = API_BASE.replace(/\/+$/, "");
        const res = await fetch(`${base}/health`, { method: "GET", cache: "no-store" });
        if (!cancelled) {
          setApiServerState(res.ok ? "ok" : "missing");
        }
      } catch {
        if (!cancelled) {
          setApiServerState("missing");
        }
      }
    };
    void run();
    const timer = window.setInterval(() => {
      void run();
    }, 15000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  return (
    <main>
      <div className="imagegen-shell" style={{ minHeight: "calc(100vh - 84px)" }}>
        <div className="imagegen-right" style={{ minWidth: 0, width: "100%" }}>
          <section className="imagegen-panel" style={{ height: "100%", minHeight: "calc(100vh - 84px)" }}>
            <h2 className="imagegen-panel-title">Installation</h2>
            <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
              <button type="button" style={tabButtonStyle(activeTab === "basic")} onClick={() => setActiveTab("basic")}>
                Basic
              </button>
              <button type="button" style={tabButtonStyle(activeTab === "advanced")} onClick={() => setActiveTab("advanced")}>
                Advanced
              </button>
            </div>
            <div className="imagegen-panel-body" style={{ height: "100%", display: "grid", gap: 12, alignContent: "start" }}>
              {activeTab === "basic" ? (
                <section
                  style={{
                    border: "1px solid #2a2f3a",
                    borderRadius: 12,
                    padding: "12px",
                    display: "grid",
                    gap: 12,
                  }}
                >
                  <h3 style={{ margin: 0, fontSize: 16 }}>Local Agent</h3>
                  {!isLocalAgentContext() ? (
                    <p style={{ margin: 0, color: "var(--muted, #94a3b8)", fontSize: 13 }}>
                      Local Agent controls are only available when using this site from a supported host on your PC.
                    </p>
                  ) : (
                    <>
                      <StatusLine
                        label="Python 3.10+"
                        purpose="Required on your PC to run the Local Agent installer and service."
                        state={pythonBasicState}
                        detail={pythonBasicDetail}
                        action={
                          pythonBasicState === "missing" ? (
                            <a
                              href={PYTHON_WINDOWS_INSTALLER_URL}
                              target="_blank"
                              rel="noreferrer"
                              style={actionButtonStyle}
                            >
                              Install Python 3.10+
                            </a>
                          ) : undefined
                        }
                      />
                      <StatusLine
                        label="Local Agent"
                        purpose="Runs on your PC so DevBloom can read/write project folders and open native file pickers."
                        state={localAgentState}
                        detail={
                          localAgentState === "ok"
                            ? "Running."
                            : localAgentState === "checking"
                              ? "Checking..."
                              : isInstalledOnDisk
                                ? "Installed but not running."
                                : "Not installed."
                        }
                      />
                      <div style={{ display: "grid", gap: 4, fontSize: 13, color: "var(--muted, #94a3b8)" }}>
                        <div>
                          Installed version:{" "}
                          <strong style={{ color: "#e2e8f0" }}>{installedVersion || "Not installed"}</strong>
                        </div>
                        <div>
                          Latest version:{" "}
                          <strong style={{ color: "#e2e8f0" }}>{latestVersion || "Unknown"}</strong>
                        </div>
                        {updateAvailable ? (
                          <p style={{ margin: "4px 0 0", color: "#fbbf24" }}>
                            An update is available. Click Install to download and apply the latest version.
                          </p>
                        ) : null}
                      </div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                        {showInstallButton ? (
                          installViaProtocol ? (
                            <a href="devbloom-agent-install://" style={actionButtonStyle}>
                              Install
                            </a>
                          ) : (
                            <button type="button" style={actionButtonStyle} onClick={triggerInstallDownloads}>
                              Install
                            </button>
                          )
                        ) : null}
                        {isInstalledOnDisk && !agentRunning ? (
                          <a href="devbloom-agent://start" style={actionButtonStyle}>
                            Run
                          </a>
                        ) : null}
                        {agentRunning ? (
                          <a href="devbloom-agent-stop://" style={actionButtonStyle}>
                            Stop
                          </a>
                        ) : null}
                      </div>
                      {showInstallButton ? (
                        <p style={{ margin: 0, fontSize: 12, color: "var(--muted, #94a3b8)", lineHeight: 1.45 }}>
                          {installViaProtocol
                            ? "Install downloads the latest release and updates AppData (uses zip in Downloads if you saved it there)."
                            : "Install saves latest.zip and DevBloom-LocalAgent-Install.bat to Downloads. Run the .bat file, then click Run here."}
                        </p>
                      ) : (
                        <p style={{ margin: 0, fontSize: 12, color: "var(--muted, #94a3b8)" }}>
                          Installed at %LOCALAPPDATA%\DevBloom\LocalAgent. Use Run to start and Stop when done.
                        </p>
                      )}
                    </>
                  )}
                </section>
              ) : (
              <section
                style={{
                  border: "1px solid #2a2f3a",
                  borderRadius: 12,
                  padding: "12px",
                  display: "grid",
                  gap: 10,
                }}
              >
                <h3 style={{ margin: 0, fontSize: 16 }}>Status</h3>
                {textureInstallResult && (
                  <div
                    role="status"
                    style={{
                      border: `1px solid ${textureInstallResult.state === "success" ? "#14532d" : "#7f1d1d"}`,
                      borderRadius: 10,
                      padding: "10px 12px",
                      background: textureInstallResult.state === "success" ? "rgba(34,197,94,0.12)" : "rgba(239,68,68,0.12)",
                      display: "grid",
                      gap: 6,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                      <strong>{textureInstallResult.state === "success" ? "Install succeeded" : "Install failed"}</strong>
                      <button type="button" onClick={() => setTextureInstallResult(null)}>
                        Dismiss
                      </button>
                    </div>
                    <p style={{ margin: 0, fontSize: 13 }}>{textureInstallResult.message}</p>
                    <p style={{ margin: 0, fontSize: 12, color: "var(--muted, #94a3b8)" }}>{textureInstallResult.at}</p>
                  </div>
                )}
                <StatusLine
                  label="Local Agent"
                  purpose="Runs on your PC so the Studio can safely read/write your game project folders, spawn native folder pickers, and host heavy local tools."
                  state={localAgentState}
                  action={instructionAction("local_agent")}
                  detail={
                    localAgentState === "ok"
                      ? agentInfo
                        ? `Running (v${agentInfo.version}). ${agentInfo.install_dir}`
                        : "Running."
                      : localAgentState === "checking"
                        ? "Checking..."
                        : localAgentState === "unknown"
                          ? "Unavailable on this host."
                          : isInstalledOnDisk
                            ? `Installed (v${installedVersion}) but not running. Use Basic tab to Run.`
                            : "Not installed. Use Basic tab to Download and Install."
                  }
                />
                <StatusLine
                  label="API Server"
                  purpose="Hosted backend for sign-in, cloud APIs, persistence, and features that cannot run entirely in the browser."
                  state={apiServerState}
                  action={instructionAction("api_server")}
                  detail={
                    apiServerState === "ok"
                      ? `Running (${API_BASE.replace(/\/+$/, "")}).`
                      : apiServerState === "checking"
                        ? "Checking..."
                        : "Not detected. Start api/run.bat."
                  }
                />
                <StatusLine
                  label="Python 3.10+ Installed"
                  purpose="The Local Agent and optional ML integrations (below) expect this Python generation; wrong versions usually break installs."
                  state={pythonState}
                  action={instructionAction("python")}
                  detail={pythonDetail}
                />
                <StatusLine
                  label="PyTorch Installed"
                  purpose="Needed on the machine running the Local Agent for GPU-backed generation (mesh, segmentation, downloads that use Torch)."
                  state={pytorchState}
                  action={instructionAction("pytorch")}
                  detail={
                    pytorchState === "ok"
                      ? "Installed."
                      : pytorchState === "checking"
                        ? "Checking..."
                        : pytorchState === "unknown"
                          ? "Unavailable."
                          : "Not installed in the root .venv."
                  }
                />
                <StatusLine
                  label="CUDA Available"
                  purpose="Lets PyTorch use an NVIDIA GPU on this machine so Mesh Gen and similar workloads stay fast instead of CPU-only."
                  state={cudaState}
                  action={instructionAction("cuda")}
                  detail={cudaDetail}
                />
                <StatusLine
                  label="HF_HOME Configured"
                  purpose="Writable cache folder Hugging Face uses when Mesh Gen pipelines download models/checkpoints locally."
                  state={hfHomeState}
                  action={instructionAction("hf_home")}
                  detail={hfHomeDetail}
                />
                <StatusLine
                  label="Hunyuan3D-2 Installed"
                  purpose="Used by Mesh Gen to turn images or prompts into 3D meshes on your machine via the Local Agent."
                  state={hunyuanState}
                  action={instructionAction("hunyuan")}
                  detail={hunyuanDetail}
                />
                <StatusLine
                  label="Hunyuan Texture Extensions"
                  purpose="Optional compiled pieces of Hunyuan for textured mesh output in Mesh Gen (not needed for geometry-only previews)."
                  state={textureExtState}
                  detail={textureExtDetail}
                  action={
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      {instructionAction("hunyuan_texture")}
                      {textureExtState === "missing" && (
                        <button
                          type="button"
                          disabled={installingTextureExt || localAgentState !== "ok"}
                          onClick={() => {
                            void (async () => {
                              setInstallingTextureExt(true);
                              setTextureExtDetail("Installing texture extensions...");
                              setTextureInstallResult(null);
                              try {
                                const result = await localAgent.installHunyuanTextureExtensions();
                                const combinedLog = [
                                  result.logs?.custom_rasterizer || "",
                                  result.logs?.differentiable_renderer || "",
                                ]
                                  .filter(Boolean)
                                  .join("\n\n---\n\n");
                                setLastTextureInstallLog(combinedLog);
                                if (result.custom_rasterizer_installed && result.differentiable_renderer_installed) {
                                  setTextureExtState("ok");
                                  setTextureExtDetail("Installed (needed for textured mesh generation).");
                                  setTextureInstallResult({
                                    state: "success",
                                    message: "Hunyuan texture extensions installed successfully.",
                                    at: `Completed at ${new Date().toLocaleTimeString()}`,
                                  });
                                } else {
                                  setTextureExtState("missing");
                                  setTextureExtDetail(
                                    "Install finished but one extension is still missing. Check Local Agent terminal output.",
                                  );
                                  setTextureInstallResult({
                                    state: "error",
                                    message: "Install ran but one extension is still missing.",
                                    at: `Completed at ${new Date().toLocaleTimeString()}`,
                                  });
                                }
                              } catch (e) {
                                setTextureExtState("missing");
                                const msg = e instanceof Error ? e.message : "Texture extension install failed.";
                                setTextureExtDetail(msg);
                                setTextureInstallResult({
                                  state: "error",
                                  message: msg,
                                  at: `Failed at ${new Date().toLocaleTimeString()}`,
                                });
                              } finally {
                                setInstallingTextureExt(false);
                              }
                            })();
                          }}
                          style={{ width: "fit-content" }}
                        >
                          {installingTextureExt ? "Installing..." : "Install Hunyuan texture"}
                        </button>
                      )}
                    </div>
                  }
                />
                {lastTextureInstallLog && (
                  <details>
                    <summary style={{ cursor: "pointer" }}>Last install log</summary>
                    <pre
                      style={{
                        margin: "8px 0 0",
                        padding: 10,
                        borderRadius: 8,
                        border: "1px solid #2a2f3a",
                        background: "#0f1115",
                        fontSize: 12,
                        whiteSpace: "pre-wrap",
                        wordBreak: "break-word",
                        maxHeight: 260,
                        overflow: "auto",
                      }}
                    >
                      {lastTextureInstallLog}
                    </pre>
                  </details>
                )}
                <StatusLine
                  label="SAM Model Installed"
                  purpose="Segment Anything runs locally so UI Builder’s UI breakdown can segment screenshots before cloud labeling passes."
                  state={samState}
                  action={instructionAction("sam")}
                  detail={samDetail}
                />
              </section>
              )}
            </div>
          </section>
        </div>
      </div>

      {instructionTopic ? (
        <div
          role="presentation"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 1000,
            background: "rgba(0,0,0,0.65)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
            boxSizing: "border-box",
          }}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) {
              setInstructionTopic(null);
            }
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="installation-instructions-title"
            style={{
              width: "100%",
              maxWidth: 560,
              maxHeight: "min(85vh, 640px)",
              overflow: "auto",
              borderRadius: 12,
              border: "1px solid #334155",
              background: "#0f1115",
              boxShadow: "0 25px 50px -12px rgba(0,0,0,0.55)",
              display: "grid",
              gap: 12,
              padding: "16px 18px",
            }}
            onMouseDown={(e) => {
              e.stopPropagation();
            }}
          >
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
              <strong id="installation-instructions-title" style={{ fontSize: 17, margin: 0, lineHeight: 1.3 }}>
                {instructionByTopic[instructionTopic].title}
              </strong>
              <button
                type="button"
                aria-label="Close instructions"
                onClick={() => setInstructionTopic(null)}
                style={{
                  flexShrink: 0,
                  padding: "6px 10px",
                  borderRadius: 8,
                  border: "1px solid #475569",
                  background: "#1e293b",
                  color: "var(--color-text, #f1f5f9)",
                  cursor: "pointer",
                }}
              >
                Close
              </button>
            </div>
            <pre
              style={{
                margin: 0,
                fontSize: 13,
                color: "#e2e8f0",
                whiteSpace: "pre-wrap",
                fontFamily: "inherit",
                lineHeight: 1.55,
              }}
            >
              {instructionByTopic[instructionTopic].body}
            </pre>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
              {instructionTopic === "python" && (
                <a
                  href="https://www.python.org/downloads/"
                  target="_blank"
                  rel="noreferrer"
                  style={{ color: "#93c5fd", fontSize: 13 }}
                >
                  Download Python 3.10 from python.org
                </a>
              )}
              {instructionTopic === "pytorch" && (
                <a
                  href="https://pytorch.org/get-started/locally/"
                  target="_blank"
                  rel="noreferrer"
                  style={{ color: "#93c5fd", fontSize: 13 }}
                >
                  Open PyTorch install selector
                </a>
              )}
              {instructionTopic === "cuda" && (
                <a
                  href="https://developer.nvidia.com/cuda-12-4-0-download-archive?target_os=Windows&target_arch=x86_64&target_version=11&target_type=exe_local"
                  target="_blank"
                  rel="noreferrer"
                  style={{ color: "#93c5fd", fontSize: 13 }}
                >
                  Download CUDA toolkit (NVIDIA archive)
                </a>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
