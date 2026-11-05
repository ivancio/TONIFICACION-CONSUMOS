Add-Type -AssemblyName System.Drawing

foreach ($size in @(192, 512)) {
    $bitmap = [System.Drawing.Bitmap]::new($size, $size)
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
    $background = [System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml('#1c1917'))
    $accent = [System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml('#16a34a'))
    $foreground = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::White)
    $font = [System.Drawing.Font]::new('Arial', [single]($size * 0.39), [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)

    $graphics.FillRectangle($background, 0, 0, $size, $size)
    $graphics.FillRectangle($accent, [single]($size * 0.18), [single]($size * 0.22), [single]($size * 0.035), [single]($size * 0.56))
    $textSize = $graphics.MeasureString('TC', $font)
    $graphics.DrawString('TC', $font, $foreground, [single](($size - $textSize.Width) / 2 + $size * 0.045), [single](($size - $textSize.Height) / 2))

    $bitmap.Save((Join-Path $PSScriptRoot "..\icons\icon-$size.png"), [System.Drawing.Imaging.ImageFormat]::Png)
    $font.Dispose()
    $foreground.Dispose()
    $accent.Dispose()
    $background.Dispose()
    $graphics.Dispose()
    $bitmap.Dispose()
}
