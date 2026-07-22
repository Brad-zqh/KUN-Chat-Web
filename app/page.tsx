"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type PersonaId = "kunkun" | "fengge" | "linqingxia" | "tulei";
type Source = { title: string; url: string };
type Message = { role: "user" | "assistant"; content: string; sources?: Source[] };

const roles: Array<{ id: PersonaId; name: string; real: string; note: string; mark: string }> = [
  { id: "kunkun", name: "坤坤", real: "蔡徐坤", note: "音乐、舞台与创作", mark: "坤" },
  { id: "fengge", name: "峰哥", real: "峰哥", note: "直接、具体的观点", mark: "峰" },
  { id: "linqingxia", name: "林青霞", real: "林青霞", note: "电影、阅读与审美", mark: "林" },
  { id: "tulei", name: "涂磊", real: "涂磊", note: "关系、责任与边界", mark: "涂" },
];

const welcomes: Record<PersonaId, string> = {
  kunkun: "你好，我是坤坤。想聊音乐、舞台、创作，或者最近的状态，都可以。",
  fengge: "有问题就直接问吧。这里会参考已经审核的公开资料来回答。",
  linqingxia: "你好。我们可以聊电影、阅读、写作，也可以聊聊生活里的感受。",
  tulei: "你可以直接说问题。我们先把事实、责任和边界理清楚。",
};

function getVisitorId() {
  const existing = localStorage.getItem("kun-public-visitor");
  if (existing) return existing;
  const value = crypto.randomUUID();
  localStorage.setItem("kun-public-visitor", value);
  return value;
}

export default function Home() {
  const [persona, setPersona] = useState<PersonaId>("kunkun");
  const [histories, setHistories] = useState<Record<string, Message[]>>({});
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState("");
  const streamRef = useRef<HTMLDivElement>(null);
  const currentRole = useMemo(() => roles.find((role) => role.id === persona)!, [persona]);
  const messages = histories[persona] || [];

  useEffect(() => {
    const saved = localStorage.getItem("kun-public-histories");
    if (saved) {
      try { setHistories(JSON.parse(saved)); } catch { /* ignore invalid local data */ }
    }
    fetch("/api/status").then((response) => response.json()).then((data) => {
      setReady(Boolean(data.ready));
      if (typeof data.freeMessages === "number") setRemaining(data.freeMessages);
    }).catch(() => setReady(false));
  }, []);

  useEffect(() => {
    localStorage.setItem("kun-public-histories", JSON.stringify(histories));
    requestAnimationFrame(() => streamRef.current?.scrollTo({ top: streamRef.current.scrollHeight, behavior: "smooth" }));
  }, [histories, persona]);

  function append(target: PersonaId, message: Message) {
    setHistories((previous) => ({ ...previous, [target]: [...(previous[target] || []), message] }));
  }

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    setError("");
    append(persona, { role: "user", content: text });
    setBusy(true);
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json", "x-visitor-id": getVisitorId() },
        body: JSON.stringify({ persona, message: text, history: messages.slice(-10) }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "暂时无法回复，请稍后再试。");
      append(persona, { role: "assistant", content: data.reply, sources: data.sources || [] });
      if (typeof data.remaining === "number") setRemaining(data.remaining);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "网络连接失败，请稍后再试。");
    } finally {
      setBusy(false);
    }
  }

  function startVoiceInput() {
    const browser = window as typeof window & { webkitSpeechRecognition?: new () => any; SpeechRecognition?: new () => any };
    const Recognition = browser.SpeechRecognition || browser.webkitSpeechRecognition;
    if (!Recognition) {
      setError("当前浏览器不支持网页语音识别，请使用最新版 Chrome、Edge 或 Safari，并允许麦克风权限。");
      return;
    }
    const recognition = new Recognition();
    recognition.lang = "zh-CN";
    recognition.interimResults = true;
    recognition.continuous = false;
    recognition.onstart = () => { setListening(true); setError(""); };
    recognition.onresult = (event: any) => {
      let text = "";
      for (let index = event.resultIndex; index < event.results.length; index += 1) text += event.results[index][0].transcript;
      setInput(text);
    };
    recognition.onerror = () => setError("没有识别到语音，请确认浏览器已获得麦克风权限。");
    recognition.onend = () => setListening(false);
    recognition.start();
  }

  function speak(text: string) {
    if (!("speechSynthesis" in window)) return setError("当前浏览器不支持语音朗读。");
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "zh-CN";
    utterance.rate = 1.03;
    window.speechSynthesis.speak(utterance);
  }

  const rendered = messages.length ? messages : [{ role: "assistant", content: welcomes[persona] } as Message];
  const avatar = persona === "kunkun" ? <img src="/kun-avatar.png" alt="坤坤 AI 动漫头像" /> : currentRole.mark;

  return (
    <main className="shell">
      <header className="topbar">
        <div className="brand"><div className="brandMark">K</div><div><strong>KUN Chat</strong><span>公开表达型 AI 对话平台</span></div></div>
        <div className="service"><i className={ready ? "online" : ""} />{ready ? "文字服务在线" : "服务检查中"}</div>
      </header>

      <nav className="rail" aria-label="选择角色">
        <p>角色</p>
        {roles.map((role) => (
          <button key={role.id} className={persona === role.id ? "active" : ""} onClick={() => { setPersona(role.id); setError(""); }}>
            <span>{role.mark}</span><b>{role.name}</b><small>{role.note}</small>
          </button>
        ))}
        <div className="railNote">所有角色均为基于已审核公开资料设计的 AI，不代表真人本人、团队或工作室。</div>
      </nav>

      <section className="chat">
        <div className="chatHead">
          <div className="portrait">{avatar}</div>
          <div><h1>{currentRole.name}</h1><p>{currentRole.note} · 双 RAG 生产资料</p></div>
          <div className="quota">{remaining === null ? "免费体验" : `剩余 ${remaining} 次`}</div>
        </div>
        <div className="disclosure">AI 同人角色 · 非{currentRole.real}本人或相关团队</div>

        <div className="stream" ref={streamRef}>
          {rendered.map((message, index) => (
            <article className={message.role} key={`${message.role}-${index}`}>
              {message.role === "assistant" && <div className="miniPortrait">{avatar}</div>}
              <div className="bubble">
                {message.content}
                {message.sources?.length ? <div className="sources"><strong>参考公开资料</strong>{message.sources.map((source) => <a key={source.url} href={source.url} target="_blank" rel="noreferrer">{source.title}</a>)}</div> : null}
                {message.role === "assistant" && <button className="listen" onClick={() => speak(message.content)}>🔊 浏览器朗读</button>}
              </div>
            </article>
          ))}
          {busy && <article className="assistant"><div className="miniPortrait">{avatar}</div><div className="bubble typing">正在组织回答<span>•••</span></div></article>}
          {error && <div className="errorBox">{error}</div>}
        </div>

        <div className="composer">
          <button className={`mic ${listening ? "listening" : ""}`} onClick={startVoiceInput} aria-label="语音输入">{listening ? "■" : "●"}</button>
          <textarea value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void send(); } }} placeholder="有问题，尽管问" rows={1} />
          <button className="send" disabled={!input.trim() || busy || remaining === 0} onClick={() => void send()} aria-label="发送">↑</button>
        </div>
        <footer>语音输入与朗读由浏览器提供，不是任何真人的克隆声音。公开版默认每位访客免费 5 次。</footer>
      </section>
    </main>
  );
}
