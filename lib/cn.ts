/**
 * className 合并工具，基于 tailwind-merge + clsx。
 *
 * 用法：cn("bg-primary text-white", userClassName)
 *
 * tailwind-merge 负责正确处理 Tailwind utility 冲突（bg-*, text-*, border-* 等全部组），
 * clsx 负责条件拼接（falsy 值自动忽略）。
 */
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
