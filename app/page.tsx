"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type PersonaId = "kunkun" | "fengge" | "linqingxia" | "tulei";
type Message = { role: "user" | "assistant"; content: string };

const personas: Record<PersonaId, { name: string; real: string; intro: string; initial: string }> = {
  kunkun: { name: "坤坤", real: "蔡徐坤", initial: "坤", intro: "聊音乐、舞台、创作，或者最近的状态。" },
  fengge: { name: "峰哥", real: "峰哥", initial: "峰", intro: "聊普通人的处境、关系选择和生活观察。" },
  linqingxia: { name: "林青霞", real: "林青霞", initial: "林", intro: "聊电影、阅读、写作和公开的人生感悟。" },
  tulei: { name: "涂磊", real: "涂磊", initial: "涂", intro: "聊关系沟通、责任、边界和现实选择。" },
};

function visitorId() {
  const key = "kun-chat-public-visitor";
  let value = localStorage.getItem(key);
  if (!value) {
    value = crypto.randomUUID();
    localStorage.setItem(key, value);
  }
  return value;
}

export default function Home() {
  const [persona, setPersona] = useState<PersonaId>("kunkun");
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [ready, setReady] = useState(false);
  const [listening, setListening] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const active = personas[persona];
  const canSend = draft.trim().length > 0 && !busy;

  useEffect(() => {
    fetch("/api/status").then((r) => r.json()).then((data) => {
      setReady(Boolean(data.ready));
      if (typeof data.freeMessages === "number") setRemaining(data.freeMessages);
    }).catch(() => setReady(false));
  }, []);

  useEffect(() => endRef.current?.scrollIntoView({ behavior: "smooth" }), [messages, busy]);

  const greeting = useMemo<Message>(() => ({
    role: "assistant",
    content: `你好，我是${active.name}。${active.intro}这里是公开资料启发的 AI 角色，不是${active.real}本人或相关团队。`,
  }), [active]);

  async function send() {
    const text = draft.trim();
    if (!text || busy) return;
    const next = [...messages, { role: "user" as const, content: text }];
    setMessages(next);
    setDraft("");
    setBusy(true);
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json", "x-visitor-id": visitorId() },
        body: JSON.stringify({ persona, message: text, history: messages.slice(-10) }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "回复失败");
      setMessages([...next, { role: "assistant", content: data.reply }]);
      if (typeof data.remaining === "number") setRemaining(data.remaining);
    } catch (error) {
      setMessages([...next, { role: "assistant", content: error instanceof Error ? error.message : "暂时无法回复，请稍后再试。" }]);
    } finally {
      setBusy(false);
    }
  }

  function speak(text: string) {
    speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text.replace(/[（(][^）)]{1,32}[）)]/g, ""));
    utterance.lang = "zh-CN";
    utterance.rate = 1.03;
    speechSynthesis.speak(utterance);
  }

  function startVoiceInput() {
    const SpeechRecognition = (window as unknown as { webkitSpeechRecognition?: new () => any; SpeechRecognition?: new () => any }).SpeechRecognition
      || (window as unknown as { webkitSpeechRecognition?: new () => any }).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("当前浏览器不支持网页语音识别，请使用最新版 Chrome，或先使用系统语音输入法。");
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.lang = "zh-CN";
    recognition.interimResults = true;
    recognition.onstart = () => setListening(true);
    recognition.onend = () => setListening(false);
    recognition.onerror = () => setListening(false);
    recognition.onresult = (event: any) => {
      const result = Array.from(event.results as ArrayLike<any>).map((item: any) => item[0].transcript).join("");
      setDraft(result);
    };
    recognition.start();
  }

  function switchPersona(value: PersonaId) {
    setPersona(value);
    setMessages([]);
  }

  const displayMessages = messages.length ? messages : [greeting];

  return (
    <main className="shell">
      <header className="topbar">
        <div className="brand">
          <div className="brandMark">K</div>
          <div><strong>KUN Chat</strong><span>公开表达型 AI 对话平台</span></div>
        </div>
        <div className="service"><i className={ready ? "online" : ""} />{ready ? "服务在线" : "正在连接"}</div>
      </header>

      <aside className="rail">
        <p>选择角色</p>
        {(Object.keys(personas) as PersonaId[]).map((id) => (
          <button key={id} className={persona === id ? "active" : ""} onClick={() => switchPersona(id)}>
            <span>{personas[id].initial}</span><b>{personas[id].name}</b><small>{id === "kunkun" ? "双 RAG" : "资料审核中"}</small>
          </button>
        ))}
        <div className="railNote">AI 角色不代表真人。公开候选资料只有通过说话人与语义双审核后才会进入生产。</div>
      </aside>

      <section className="chat">
        <div className="chatHead">
          <div className="portrait">{active.initial}</div>
          <div><h1>{active.name}</h1><p>{active.intro}</p></div>
          <span className="quota">{remaining === null ? "测试额度" : `剩余 ${remaining} 次`}</span>
        </div>
        <div className="disclosure">AI 同人角色 · 非{active.real}本人或相关团队</div>
        <div className="stream">
          {displayMessages.map((message, index) => (
            <article key={`${message.role}-${index}`} className={message.role}>
              {message.role === "assistant" && <div className="miniPortrait">{active.initial}</div>}
              <div className="bubble">
                {message.content}
                {message.role === "assistant" && <button className="listen" onClick={() => speak(message.content)}>▶ 朗读</button>}
              </div>
            </article>
          ))}
          {busy && <article className="assistant"><div className="miniPortrait">{active.initial}</div><div className="bubble typing">正在组织回答<span>•••</span></div></article>}
          <div ref={endRef} />
        </div>
        <div className="composer">
          <button className={listening ? "mic listening" : "mic"} onClick={startVoiceInput} aria-label="语音输入">{listening ? "■" : "●"}</button>
          <textarea value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }} placeholder="有问题，尽管问" rows={1} />
          <button className="send" onClick={send} disabled={!canSend} aria-label="发送">↑</button>
        </div>
        <footer>服务端密钥不会下发到浏览器 · 语音输入取决于浏览器支持 · 对话请勿用于冒充真人</footer>
      </section>
    </main>
  );
}
