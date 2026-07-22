import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "KUN Chat｜公开表达型 AI 对话平台",
  description: "与坤坤、峰哥、林青霞、涂磊四个基于已审核公开资料设计的 AI 角色进行文字和语音对话。",
  openGraph: {
    title: "KUN Chat",
    description: "公开表达型 AI 对话平台",
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
