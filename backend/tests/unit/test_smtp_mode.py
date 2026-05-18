from app.utils.smtp_mode import smtp_mode_banner_lines


def test_banner_lists_manual_consequences():
    lines = smtp_mode_banner_lines(smtp_configured=False)
    joined = "\n".join(lines)
    assert "Email delivery is not configured" in joined
    assert "email-optional mode" in joined
    assert "recovery link" in joined.lower()
    assert "docs/guides/running-without-smtp.md" in joined
    assert any("admin" in line.lower() for line in lines)


def test_banner_empty_when_smtp_configured():
    assert smtp_mode_banner_lines(smtp_configured=True) == []
