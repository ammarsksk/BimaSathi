# Form Template Authoring Worksheet

This is the finalized manual worksheet for building the insurer-specific PDF filler for:

- `SBI.pdf`
- `ICICI Lombard.pdf`

Both PDFs are flat templates with `0` AcroForm fields. The implementation must therefore use PDF overlay rendering, not standard form filling.

## Remaining Manual Work

I have filled in the business judgments below: required vs optional, checkbox behavior, what should be asked, and what should stay blank.

The remaining manual work is layout-only:

1. Confirm the final PDF versions.
2. Record field coordinates:
   - page
   - x
   - y
   - width
   - font size
   - alignment
3. Record checkbox coordinates.
4. Validate one sample filled PDF per insurer.

## Output Schema To Author

For every mapped field, capture:

| Column | Meaning |
|---|---|
| `template_id` | `sbi` or `icici_lombard` |
| `page` | PDF page number |
| `pdf_label` | Visible field label on the PDF |
| `field_id` | Canonical internal field id |
| `type` | `text`, `multiline`, `date`, `number`, `checkbox` |
| `required` | `yes`, `no`, `conditional`, `operator_only` |
| `checkbox_behavior` | `n/a`, `one_of_many`, `yes_no`, `derived_yes_only`, `multi_select` |
| `source_priority` | e.g. `claim.farmerName -> identity.verifiedName -> ask_user` |
| `x` | PDF x coordinate |
| `y` | PDF y coordinate |
| `width` | Max width allowed for rendering |
| `font_size` | Render font size |
| `align` | `left`, `center`, `right` |
| `notes` | Formatting or business rules |

## Judgement Rules Used

### Required

A field is `yes` when the form is materially incomplete without it, especially for:

- identity
- payout/bank details
- land/crop/loss data
- insurer routing or policy data
- compliance declarations

### Optional

A field is `no` when the form can still be usefully generated without it.

### Conditional

A field is `conditional` when it becomes required only after another answer.

Examples:

- post-harvest details only when `post_harvest_loss = yes`
- PEP details only when `pep = yes`
- actual harvest date only when already harvested

### Checkbox Behavior

- `one_of_many`: exactly one option in a category should be ticked
- `yes_no`: exactly one of yes/no should be ticked
- `derived_yes_only`: tick the visible yes box only when the answer is yes; otherwise leave blank
- `multi_select`: allow multiple ticks

## SBI Template

Extracted labels indicate the SBI form is a PMFBY claim/intimation form.

### SBI Page 1

| PDF label | Suggested field id | Type | Required | Checkbox behavior | Likely source | Notes |
|---|---|---|---|---|---|---|
| `Name of Farmer` | `farmer_name` | text | yes | n/a | claim / verified identity | authoritative source should be verified identity if available |
| `Father's Name` | `father_name_or_spouse_name` | text | yes | n/a | document extraction / ask user | use internal label `father_or_spouse_name` even if PDF says father |
| `Category (SC/ST/OBC/Others)` | `social_category` | checkbox | no | `one_of_many` | ask user | do not render as text |
| `Gender (M/F)` | `gender` | checkbox | yes | `one_of_many` | ask user | tick one only |
| `Address` | `farmer_address` | multiline | yes | n/a | claim / ask user | full postal address line |
| `Contact Number` | `mobile_number` | text | yes | n/a | session / claim | use WhatsApp number if farmer confirms |
| `Aadhaar Number` | `aadhaar_number` | text | yes | n/a | document extraction / ask user | required for insurer-ready packet |
| `Bank Account Number` | `bank_account_number` | text | yes | n/a | document extraction / ask user | payout-critical |
| `Bank Name` | `bank_name` | text | yes | n/a | document extraction / ask user | payout-critical |
| `Branch Location` | `bank_branch_location` | text | yes | n/a | document extraction / ask user | payout-critical |
| `IFSC CODE` | `ifsc_code` | text | yes | n/a | document extraction / ask user | payout-critical |
| `MICR CODE` | `micr_code` | text | no | n/a | document extraction / ask user | leave blank if unavailable |
| `Account Type Crop Loan or Saving Account` | `account_type` | checkbox | yes | `one_of_many` | ask user | choose `crop_loan` or `saving_account` |
| `Whether you have availed any loan on crop / or hold KCC YES/NO` | `has_crop_loan_or_kcc` | checkbox | yes | `yes_no` | ask user | explicit yes/no |
| `District, Block, Grampanchayat of insured field` | `insured_field_admin_area` | multiline | yes | n/a | claim / ask user | combine district/block/grampanchayat if one render area |
| `Total Area of Insured ... Hectare` | `insured_area_hectare` | number | yes | n/a | claim | numeric, hectares |
| `Crop under loss` | `crop_name` | text | yes | n/a | claim | crop name used in claim |
| `Date of Loss` | `loss_date` | date | yes | n/a | claim | normalized output date |
| `Cause of Loss` | `loss_event_summary` | text | yes | n/a | claim | textual summary for readability even if checkboxes also exist |
| `hailstorm` | `risk_hailstorm` | checkbox | conditional | `one_of_many` | derived | part of main cause group |
| `landslide` | `risk_landslide` | checkbox | conditional | `one_of_many` | derived | part of main cause group |
| `Inundation` | `risk_inundation` | checkbox | conditional | `one_of_many` | derived | part of main cause group |
| `Post Harvesting loss` | `post_harvest_loss_flag` | checkbox | conditional | `one_of_many` | claim / ask user | part of main cause group |

### SBI Page 2

| PDF label | Suggested field id | Type | Required | Checkbox behavior | Likely source | Notes |
|---|---|---|---|---|---|---|
| `Cyclone` | `risk_cyclone` | checkbox | conditional | `one_of_many` | claim | part of main cause group |
| `Cyclonic rains` | `risk_cyclonic_rain` | checkbox | conditional | `one_of_many` | claim | part of main cause group |
| `Unseasonal rains` | `risk_unseasonal_rain` | checkbox | conditional | `one_of_many` | claim | part of main cause group |
| `In case of Post-Harvest Losses Date of Harvesting` | `harvesting_date` | date | conditional | n/a | claim / ask user | required only for post-harvest loss |
| `Reason for keeping crop at loss location for Storage` | `post_harvest_storage_reason` | multiline | conditional | n/a | ask user | required only for post-harvest loss |
| `To dry in cut and spread condition in the field after harvesting` | `post_harvest_drying_reason_flag` | checkbox | conditional | `yes_no` | ask user | tick when applicable; otherwise use other reason |
| `Other, please specify the reason` | `post_harvest_other_reason` | multiline | conditional | n/a | ask user | required only if drying flag is not the reason |
| `Declaration` | `declaration_text` | static text | operator_only | n/a | template static | not filled by user |
| `Place` | `place` | text | yes | n/a | claim village / ask user | default to claim village unless user provides signing place |
| `Date` | `form_sign_date` | date | yes | n/a | system date / ask user | form generation date is acceptable |
| `Signature - Farmer` | `farmer_signature_slot` | signature placeholder | operator_only | n/a | leave blank | keep blank in generated PDF |

### SBI Checkbox Policy

- `social_category`: tick exactly one of `SC`, `ST`, `OBC`, `Others`
- `gender`: tick exactly one of `M` or `F`
- `account_type`: tick exactly one of `Crop Loan` or `Saving Account`
- `has_crop_loan_or_kcc`: tick `Yes` or `No`
- `loss-cause group`: treat these as one primary-cause group:
  - `hailstorm`
  - `landslide`
  - `inundation`
  - `cyclone`
  - `cyclonic rains`
  - `unseasonal rains`
  - `post-harvest loss`
- `post_harvest_drying_reason_flag`: tick only when the reason is drying in cut-and-spread condition

### SBI Final Decisions

- `Father's Name` should be handled internally as `father_or_spouse_name`
- `Category` and `Gender` are separate checkbox groups
- `Account Type` is a checkbox pair, not free text
- `MICR` is optional
- `Signature - Farmer` must stay blank

## ICICI Lombard Template

The ICICI PDF text is more cleanly extractable, so the labels below are close to the printed wording.

### ICICI Page 1

| PDF label | Suggested field id | Type | Required | Checkbox behavior | Likely source | Notes |
|---|---|---|---|---|---|---|
| `Name of the Insured Farmer` | `farmer_name` | text | yes | n/a | claim / verified identity | authoritative source should be verified identity if available |
| `Name of the father/Spouse of Insured` | `father_name_or_spouse_name` | text | yes | n/a | document extraction / ask user | required for insurer-ready packet |
| `Mobile No` | `mobile_number` | text | yes | n/a | claim | payout/contact-critical |
| `Mailing Address` | `mailing_address` | multiline | yes | n/a | claim / ask user | full postal address line |
| `Village` | `mailing_village` | text | yes | n/a | claim / ask user | mailing address section |
| `Post Office` | `mailing_post_office` | text | no | n/a | ask user | optional if unavailable |
| `Tehsil` | `mailing_tehsil` | text | yes | n/a | claim / ask user | mailing address section |
| `District` | `mailing_district` | text | yes | n/a | claim | mailing address section |
| `State` | `mailing_state` | text | yes | n/a | claim | mailing address section |
| `Pin Code` | `mailing_pin_code` | text | yes | n/a | ask user | mailing address section |
| `Address of Land` | `land_address` | multiline | yes | n/a | claim / ask user | separate from mailing address |
| `Village` | `land_village` | text | yes | n/a | claim | land address section |
| `Post Office` | `land_post_office` | text | no | n/a | ask user | optional if unavailable |
| `Tehsil` | `land_tehsil` | text | yes | n/a | ask user | land address section |
| `District` | `land_district` | text | yes | n/a | claim | land address section |
| `State` | `land_state` | text | yes | n/a | claim | land address section |
| `Pin Code` | `land_pin_code` | text | no | n/a | ask user | optional if unavailable |
| `Email Id (If available)` | `email` | text | no | n/a | ask user | explicitly optional |
| `Cast (SC/ST/ GEN/OTHER)` | `social_category` | checkbox | no | `one_of_many` | ask user | treat internally as caste/category |
| `Gender` | `gender` | checkbox | yes | `one_of_many` | ask user | checkbox group, not text |
| `Scheme` | `scheme_name` | text | yes | n/a | static `PMFBY` | autofill static |
| `PMFBY` | `scheme_name_static` | static text | operator_only | n/a | template static | not a user field |
| `Crop Season/Year` | `crop_season_year` | text | yes | n/a | claim / ask user | required for insurer routing |
| `Crop Name` | `crop_name` | text | yes | n/a | claim | required |
| `Sowing date` | `sowing_date` | date | yes | n/a | ask user | agronomy-critical |
| `Stage of Crop` | `crop_stage` | text | yes | n/a | ask user | agronomy-critical |
| `Proposed date of Harvesting` | `proposed_harvest_date` | date | conditional | n/a | ask user | required if not yet harvested |
| `Harvesting Date (IF already harvested)` | `harvesting_date` | date | conditional | n/a | ask user | required if already harvested |
| `Crop Acreage (Insured area in Ha)` | `insured_area_hectare` | number | yes | n/a | claim | required |
| `Total Land (Ha)` | `total_land_hectare` | number | yes | n/a | ask user | required |
| `Total Land Insured (Ha)` | `total_land_insured_hectare` | number | yes | n/a | claim / ask user | required |
| `If the Insured is Loanee/Non Loanee` | `loanee_status` | checkbox | yes | `one_of_many` | ask user | checkbox group, not text |
| `Survey No/Khasara No/Udyan Card No` | `survey_or_khasara_or_udyan_no` | text | yes | n/a | ask user / document extraction | keep as one render field |
| `Name of Notified area` | `notified_area_name` | text | yes | n/a | ask user | required |
| `Sum Insured (Rs)` | `sum_insured_rupees` | number | yes | n/a | policy document / ask user | required |
| `Premium paid by Farmers (Rs)` | `premium_paid_rupees` | number | yes | n/a | policy document / ask user | required |
| `Date of Premium deducted in case of Loanee farmer/Date of Issuance of Cover note in case non loanee farmer` | `premium_deduction_or_cover_note_date` | date | yes | n/a | policy document / ask user | required |

### ICICI Page 2

| PDF label | Suggested field id | Type | Required | Checkbox behavior | Likely source | Notes |
|---|---|---|---|---|---|---|
| `Are you or any of the proposed applicants a PEP* or Family member / Close relatives / Associates of PEP*?` | `pep_declaration` | checkbox | yes | `derived_yes_only` if only a yes box exists, otherwise `yes_no` | ask user | ask explicitly in chat |
| `Yes` | `pep_yes_checkbox` | checkbox | conditional | tick only when `pep_declaration = yes` | derived | blank when no |
| `If yes, please give details (Nature of relationship and position held by PEP)` | `pep_details` | multiline | conditional | n/a | ask user | required only if yes |
| `PEP footnote / explanatory text` | `pep_explanatory_static` | static text | operator_only | n/a | template static | not a user field |

### ICICI Checkbox Policy

- `social_category`: tick exactly one of `SC`, `ST`, `GEN`, `OTHER`
- `gender`: tick exactly one available gender box
- `loanee_status`: tick exactly one of `Loanee` or `Non Loanee`
- `pep_declaration`: ask yes/no in chat; if the form exposes only a `Yes` checkbox, tick it only for yes and leave blank for no

### ICICI Final Decisions

- Preserve the PDF label `Cast`, but treat it internally as caste/category
- `Gender`, `Loanee/Non Loanee`, and `SC/ST/GEN/OTHER` are checkbox groups
- Mailing and land address should only mirror when the user explicitly confirms they are the same
- `Survey No/Khasara No/Udyan Card No` stays one canonical render field
- `PEP` must be asked explicitly, not defaulted to `No`

## Final Fill Policy

### Must be present before generating SBI

- farmer name
- father/spouse name
- address
- mobile number
- Aadhaar number
- bank account number
- bank name
- branch location
- IFSC code
- account type
- KCC / crop-loan declaration
- insured field admin area
- insured area
- crop name
- loss date
- one selected loss cause
- place
- form date

### Must be present before generating ICICI

- farmer name
- father/spouse name
- mobile number
- mailing address core fields
- land address core fields
- gender
- crop season/year
- crop name
- sowing date
- crop stage
- insured area
- total land
- total land insured
- loanee/non-loanee status
- survey/khasara/udyan number
- notified area
- sum insured
- premium paid
- premium deduction / cover note date
- PEP declaration

### Leave blank by default

- signature slots
- template static explanatory text
- optional email
- optional MICR code
- optional post office fields if unavailable
- conditional post-harvest fields when post-harvest loss is not selected

## Recommended Implementation Order

1. Build `SBI` first, because the field set is smaller and more operationally direct.
2. Validate one real filled `SBI` sample.
3. Reuse the same renderer pipeline for `ICICI Lombard`.
4. Only after both mappings are stable, wire them into the chatbot document-builder flow.
