import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "KUN Chat｜AI 数字人与赛博同人对话平台",
  description: "与坤坤、峰哥、林青霞、涂磊四个基于已审核公开资料设计的 AI 数字人进行文字和语音对话。",
  openGraph: {
    title: "KUN Chat",
    description: "AI 数字人与赛博同人对话平台",
    images: ["/og.png"],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
