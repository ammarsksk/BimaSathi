const { _Format_Phone } = require('./twilio');

const _DEMO_OPERATOR_PHONE = _Format_Phone('9999000001');
const _DEMO_FARMER_PHONE = _Format_Phone('9999000002');
const _DEMO_FIXED_OTP = '123456';

function _Normalize_Phone(_Phone) {
    if (!_Phone) return '';
    return _Format_Phone(String(_Phone));
}

function _Is_Demo_Operator_Phone(_Phone) {
    return _Normalize_Phone(_Phone) === _DEMO_OPERATOR_PHONE;
}

function _Is_Demo_Farmer_Phone(_Phone) {
    return _Normalize_Phone(_Phone) === _DEMO_FARMER_PHONE;
}

module.exports = {
    _DEMO_OPERATOR_PHONE,
    _DEMO_FARMER_PHONE,
    _DEMO_FIXED_OTP,
    _Is_Demo_Operator_Phone,
    _Is_Demo_Farmer_Phone,
};
