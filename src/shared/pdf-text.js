function _Sanitize_PDF_Text(_Value, _Options = {}) {
    const _Allow_Newlines = Boolean(_Options.allowNewlines);
    let _Text = String(_Value ?? '');

    _Text = _Text
        .replace(/\r\n/g, _Allow_Newlines ? '\n' : ' ')
        .replace(/[\r\t]/g, ' ')
        .replace(/\u2028|\u2029/g, _Allow_Newlines ? '\n' : ' ')
        .replace(/\u00A0/g, ' ')
        .replace(/[•●◦]/g, '*')
        .replace(/[✓✔]/g, '[OK]')
        .replace(/[—–]/g, '-')
        .replace(/[…]/g, '...')
        .replace(/[“”]/g, '"')
        .replace(/[‘’]/g, "'")
        .replace(/[^\x20-\x7E\n]/g, ' ')
        .replace(/ {2,}/g, ' ');

    if (!_Allow_Newlines) {
        _Text = _Text.replace(/\n+/g, ' ');
    } else {
        _Text = _Text.replace(/[ ]*\n[ ]*/g, '\n').replace(/\n{3,}/g, '\n\n');
    }

    return _Text.trim();
}

function _Wrap_PDF_Text(_Value, _Font, _Size, _Max_Width) {
    const _Sanitized = _Sanitize_PDF_Text(_Value, { allowNewlines: true });
    const _Paragraphs = _Sanitized.split('\n');
    const _Lines = [];

    for (const _Paragraph of _Paragraphs) {
        const _Words = _Paragraph.split(/\s+/).filter(Boolean);
        if (!_Words.length) {
            if (_Lines.length && _Lines[_Lines.length - 1] !== '') _Lines.push('');
            continue;
        }

        let _Current = '';
        for (const _Word of _Words) {
            const _Test = _Current ? `${_Current} ${_Word}` : _Word;
            if (_Font.widthOfTextAtSize(_Test, _Size) > _Max_Width && _Current) {
                _Lines.push(_Current);
                _Current = _Word;
            } else {
                _Current = _Test;
            }
        }

        if (_Current) _Lines.push(_Current);
    }

    return _Lines.filter((_Line, _Index, _Arr) => _Line !== '' || (_Index > 0 && _Arr[_Index - 1] !== ''));
}

module.exports = {
    _Sanitize_PDF_Text,
    _Wrap_PDF_Text,
};
