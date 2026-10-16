export const brandLogo =
  '<img src="/brand/noir-logo.svg" width="300" height="100" alt="NOIR CINEMA" decoding="async">';
export const brandMark =
  '<img class="brand-mark" src="/brand/noir-mark.svg" width="96" height="96" alt="" aria-hidden="true" decoding="async">';

export function drawBrandMark(context, x, y, size) {
  context.save();
  context.translate(x, y);
  context.scale(size / 96, size / 96);
  context.fillStyle = "#c9a66b";
  const shape = new Path2D("M16 16h16l32 40V16h16v64H64L32 40v40H16z");
  context.clip(shape);
  shape.addPath(
    new Path2D(
      "M21 22h6v5h-6zm0 13h6v5h-6zm0 13h6v5h-6zm0 13h6v5h-6zm0 11h6v4h-6zm48-50h6v5h-6zm0 13h6v5h-6zm0 13h6v5h-6zm0 13h6v5h-6zm0 11h6v4h-6zM47 39l9 9-9 9z",
    ),
  );
  context.fill(shape, "evenodd");
  context.restore();
}
