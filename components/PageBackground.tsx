/**
 * 全局统一的深蓝氛围背景装饰组件。
 *
 * 被首页、书橱、登录、注册四个页面共用，
 * 避免在每个页面里重复 ~20 行完全相同的背景渐变 + 网格代码。
 */
export function PageBackground() {
  return (
    <>
      {/* 径向渐变光晕 */}
      <div
        className="pointer-events-none fixed inset-0"
        style={{
          backgroundImage: `
            radial-gradient(ellipse at top left, rgba(56,82,140,0.35), transparent 55%),
            radial-gradient(ellipse at bottom right, rgba(99,72,180,0.25), transparent 55%),
            radial-gradient(circle at center, rgba(255,255,255,0.02), transparent 70%)
          `,
        }}
      />
      {/* 网格纹理 */}
      <div
        className="pointer-events-none fixed inset-0 opacity-[0.04]"
        style={{
          backgroundImage: `
            linear-gradient(rgba(255,255,255,0.6) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.6) 1px, transparent 1px)
          `,
          backgroundSize: "32px 32px",
        }}
      />
    </>
  );
}
