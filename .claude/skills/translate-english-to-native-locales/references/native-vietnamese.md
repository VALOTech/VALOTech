# Bản ngữ tiếng Việt — sổ tay chống dịch máy và viết cho tự nhiên

Mục tiêu của file này: biến kỹ năng "viết tiếng Việt như người bản xứ" từ *may nhờ năng lực* thành *có thể lặp lại*. Phần lớn văn bản kém tự nhiên không phải vì sai ngữ pháp, mà vì mang **dấu vết dịch từ tiếng Anh** (translationese) hoặc **giọng AI**. Bên dưới gọi tên từng dấu vết đó và cho bản sửa. Khi viết hoặc rà một bản tiếng Việt, đối chiếu với các mục này trước khi coi là xong.

Linter (`lint_style_patterns.py`) chỉ bắt được một phần các dấu vết này. **"Lint sạch" không phải bằng chứng của tự nhiên.** Danh sách dưới đây mới là bài kiểm tra thật; linter chỉ là lưới chặn thô.

## 1. Dấu vết dịch máy / giọng AI — gọi tên và sửa

Mỗi dòng: mẫu cần tránh → vì sao đọc "Tây" hoặc máy móc → hướng sửa. Không cấm tuyệt đối; nếu mẫu đó thật sự đúng nghĩa và tự nhiên trong ngữ cảnh, giữ lại. Nhưng mặc định là sửa.

| Dấu vết | Vì sao chối tai | Hướng sửa |
|---|---|---|
| `một cách` + tính từ ("một cách liền mạch", "một cách hiệu quả", "một cách toàn diện") | Bê nguyên trạng ngữ "-ly" của tiếng Anh. Người Việt hiếm khi nói vậy. | Bỏ hẳn, hoặc chuyển thành động từ/tính từ trực tiếp: "vận hành trơn tru", "làm việc hiệu quả", "bảo vệ đầy đủ". |
| `công nghệ hiện đại` / `công nghệ tiên tiến` (nói chung, không nêu công nghệ gì) | Chữ độn rỗng, không thêm thông tin. | Nêu công nghệ cụ thể, hoặc bỏ. Nếu không biết cụ thể thì đừng khẳng định. |
| `đặt lên hàng đầu` / `ưu tiên hàng đầu` | Sáo ngữ quảng cáo, ai cũng nói nên thành vô nghĩa. | Nói việc cụ thể: "không chia sẻ dữ liệu của bạn cho bên thứ ba", "mã hóa tin nhắn". |
| `Điều này có nghĩa là` (mở câu) | Dịch thẳng "This means". | Nối trực tiếp bằng quan hệ thật: "Nhờ vậy…", "Vì thế…", hoặc gộp vào câu trước. |
| `được thiết kế nhằm` / `được xây dựng để` | Bị động + mục đích kiểu Anh. | Chủ động: "Tính năng X giúp bạn…", "X cho bạn…". |
| `cho phép … có thể` / `giúp … có thể` | Thừa "có thể"; calque "allows … to". | Bỏ "có thể": "cho phép bạn gọi video", "giúp bạn kiểm soát quyền riêng tư". |
| `trao quyền cho người dùng` | Dịch máy "empower users"; sáo và xa cách. | "cho bạn tự quyết…", "bạn tự chọn…". |
| `việc` / `sự` + động từ, lặp nhiều ("việc thực hiện triển khai", "sự gia tăng của") | Danh-từ-hóa nặng, đặc trưng văn bản dịch/hành chính. | Trả về động từ: "khi triển khai…", "ngày càng nhiều…". |
| `các` / `những` rải khắp nơi | Tiếng Việt không bắt buộc đánh dấu số nhiều; lạm dụng là do bám tiếng Anh. | Bỏ khi ngữ cảnh đã rõ số nhiều: "quản lý quyền truy cập" thay vì "quản lý các quyền truy cập". |
| `Hơn nữa,` / `Bên cạnh đó,` / `Ngoài ra,` mở đầu mà không có quan hệ thật | Chuyển ý bề mặt, che chỗ thiếu logic. | Nêu quan hệ thật (nguyên nhân, tương phản, điều kiện) hoặc bỏ. |
| Cấu trúc ba vế lặp ("an toàn, tiện lợi và hiệu quả") | Nhịp khẩu hiệu, nghe sáo rỗng. | Giữ một–hai ý có thực, cắt vế độn. |
| `đảm bảo rằng` / `nhằm đảm bảo` | Dịch "ensure that"; thường là hứa hão. | Nói cơ chế thật, hoặc hạ xuống mức đúng: "để…", "giúp giảm…". |
| `mang lại` / `mang tính` + danh từ trừu tượng | Động từ rỗng phủ lên danh từ trừu tượng. | Động từ cụ thể: "giúp tiết kiệm", "khiến quy trình rõ ràng hơn". |
| `không chỉ … mà còn` (khi chỉ để nghe kêu) | Calque "not only … but also", nhồi cho sang. | Tách hai câu, hoặc giữ nếu tương phản thật sự cần. |
| Từ Hán–Việt nặng khi có từ thuần Việt rõ nghĩa ("khả dĩ", "tối ưu hóa trải nghiệm") | Đao to búa lớn, xa người đọc phổ thông. | Dùng từ thường: "có thể", "làm trải nghiệm tốt hơn". |
| Bị động "được" chồng nhau ("dữ liệu được bảo vệ, được mã hóa và được lưu trữ") | Chuỗi bị động kiểu Anh. | Đổi sang chủ động hoặc gộp: "chúng tôi mã hóa và lưu trữ dữ liệu của bạn". |

**Ba dấu vết đầu bảng (`một cách + adj`, `công nghệ hiện đại`, `đặt lên hàng đầu`) là ví dụ có thật: một bản dịch máy chứa cả ba vẫn qua được linter cũ.** Đó là lý do bảng này tồn tại.

## 2. Xưng hô và register — trục khó nhất

Tiếng Việt không có đại từ trung tính như "you". Chọn sai cặp xưng hô là hỏng ngay, dù câu đúng ngữ pháp. **Không mặc định.** Quy trình:

1. Xác định quan hệ người nói ↔ người đọc và loại tài liệu.
2. Chọn cặp xưng hô theo bảng, rồi giữ nhất quán toàn văn bản (không đổi giữa chừng).

| Ngữ cảnh | Người đọc = | Cặp xưng hô | Ghi chú |
|---|---|---|---|
| App tiêu dùng thân thiện (hẹn hò, mạng xã hội, game) | một cá nhân trẻ | gọi người đọc **"bạn"**, thương hiệu tự xưng bằng **tên** ("Amavo") hoặc "chúng mình" | Ấm, ngang hàng. Đây là register của Amavo (catalogue thật dùng "bạn"). |
| Sản phẩm/công cụ chuyên nghiệp trung tính | người dùng chuyên môn | **"bạn"** ↔ **"chúng tôi"** | Lịch sự, không thân mật quá. |
| Tài liệu định chế/tài chính/pháp lý trang trọng | khách hàng/đối tác | **"Quý khách" / "Quý Đối tác"** ↔ **"chúng tôi"** | Chỉ dùng khi văn bản thật sự trang trọng; đừng nhét vào app tiêu dùng. |
| Tài liệu kỹ thuật nội bộ, hướng dẫn, mã nguồn | lập trình viên | **lược đại từ**; câu mệnh lệnh | "Chạy lệnh…", "Kiểm tra…". Không "bạn hãy". |

Bẫy thường gặp:
- **Mặc định "người dùng" trong văn bản nói với chính người đọc.** UI nói thẳng với người đọc thì dùng "bạn", không phải "người dùng có thể…". "Người dùng" chỉ dùng khi nói *về* người dùng ở ngôi thứ ba (tài liệu, mô tả tính năng).
- **"chúng ta" vs "chúng tôi".** "chúng tôi" = phía người nói (loại trừ người nghe). "chúng ta" = gồm cả người nghe. Nói sai đổi hẳn nghĩa.
- **Trộn register.** Mở bằng "bạn" rồi giữa bài nhảy sang "Quý khách" là lỗi nặng.
- **"Quý khách" mặc định cho mọi thứ.** Chỉ hợp ngân hàng/bảo hiểm/văn bản trang trọng, không hợp app trẻ.

## 3. Cơ chế trình bày — dấu câu, khoảng trắng, số, chữ hoa (phần hay sai ở text UI/HTML/button)

- **Chữ hoa:** dùng **sentence case** cho tiêu đề, nút, nhãn ("Bắt đầu buổi hẹn video", không "Bắt Đầu Buổi Hẹn Video"). Không viết hoa kiểu tiếng Anh. Không viết hoa danh từ chung để "cho quan trọng". Không ALL-CAPS trừ khi template bắt.
- **Khoảng trắng và dấu câu:** không có khoảng trắng trước `, . : ; ! ? %`; có một khoảng trắng sau. Dấu ba chấm dùng "…" một ký tự khi có thể.
- **Số và tiền:** phân nhóm nghìn bằng dấu chấm, thập phân bằng dấu phẩy: `1.000.000`, `12,5%`. Tiền đồng: `1.000.000 ₫` hoặc `1.000.000đ` (theo house style). **Phần trăm dính số:** `20%`, không "20 %".
- **Ngày:** `dd/mm/yyyy` (13/08/2026), không `mm/dd`.
- **Dấu ngoặc kép:** dùng `"…"`; kiểu «…» chỉ khi template yêu cầu. Không dùng dấu nháy cong kiểu Anh lẫn lộn.
- **Dấu thanh (diacritics):** viết đủ và đúng dấu. "hằng" ≠ "hàng", "sả" ≠ "sa". Không bỏ dấu để "cho gọn".
- **Không dùng dấu phẩy Oxford** kiểu Anh trong liệt kê tiếng Việt: "A, B và C" (không "A, B, và C").
- **Độ dài chuỗi UI:** tiếng Việt thường **dài hơn tiếng Anh 20–40%**. Với nút/nhãn có giới hạn, tìm cách nói ngắn tự nhiên ("Thử lại", "Bắt đầu") thay vì cắt cụt mất nghĩa; nếu không vừa, nêu vấn đề thiết kế, đừng lặng lẽ bỏ chữ.

## 4. Từ vựng, thuật ngữ, biến thể vùng

- Ưu tiên từ phổ thông khi vẫn chính xác; chỉ dùng thuật ngữ chuyên môn đã được cộng đồng nghề nghiệp hoặc tài liệu kiểm soát xác nhận. Không tự bịa "chuẩn ngành".
- **Giữ tên tiếng Anh** cho sản phẩm, framework, API, mã định danh, viết tắt thông dụng khi bản dịch hiếm dùng, dài, lạ hoặc mất khả năng nhận diện (API, SDK, WebRTC, token…). Có thể giải thích ngắn ở lần xuất hiện đầu.
- **Thuật ngữ nhà (house term) chưa chốt thì đánh dấu, đừng tự quyết.** Ví dụ trong app hẹn hò: `match` (giới trẻ quen từ tiếng Anh, kiểu Tinder) hay `ghép đôi`? `Rose` hay `hoa hồng`? Đây là quyết định của chủ sản phẩm — nếu chưa có glossary chốt, chọn phương án hợp lý nhất **và nêu rõ đó là lựa chọn cần duyệt**, giữ nhất quán trong bản. (Trong catalogue Amavo hiện chưa có từ nào được chốt.)
- Miền Bắc/Trung/Nam có khác biệt từ vựng; mặc định dùng tiếng phổ thông (chuẩn báo chí) trừ khi đối tượng là một vùng cụ thể.

## 5. Ví dụ trước → sau (cấp đoạn)

**Bản dịch máy (mọi dấu vết cùng xuất hiện):**
> Tính năng hẹn hò qua video được thiết kế nhằm cho phép các thành viên có thể kết nối với nhau một cách liền mạch và an toàn. Bằng việc sử dụng công nghệ tiên tiến, chúng tôi trao quyền cho người dùng để họ có thể tận hưởng những cuộc trò chuyện có ý nghĩa. Điều này có nghĩa là mọi tương tác đều được bảo vệ một cách toàn diện.

Chẩn: `được thiết kế nhằm` · `cho phép…có thể` · `các thành viên` (số nhiều thừa) · `một cách liền mạch` · `Bằng việc sử dụng` · `công nghệ tiên tiến` (rỗng) · `trao quyền cho người dùng để họ có thể` · `Điều này có nghĩa là` · `được bảo vệ một cách toàn diện`.

**Viết lại tự nhiên (giọng app nói với "bạn", giữ đúng ý, không bịa thêm):**
> Với hẹn hò qua video, bạn gặp và trò chuyện trực tiếp với người mình quan tâm. Nhìn thấy nụ cười, nghe được giọng nói của nhau, cả hai dễ mở lòng hơn. Mỗi cuộc gọi diễn ra trong không gian riêng tư, và Amavo bảo vệ thông tin cá nhân của bạn.

Lưu ý: bản viết lại **không** thêm cam kết mà dữ kiện gốc không có (không hứa "an toàn tuyệt đối", không bịa cơ chế). Đó là ranh giới giữa *viết cho hay* và *nói quá*.
