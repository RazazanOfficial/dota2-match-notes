use std::{fs::File, io::{self, BufReader, Read, Write}};

pub const MAX_REPLAY_BYTES: u64 = 2 * 1024 * 1024 * 1024;

struct LimitedInput<R> { inner: R, remaining: u64 }
impl<R: Read> Read for LimitedInput<R> {
    fn read(&mut self, buffer: &mut [u8]) -> io::Result<usize> {
        if buffer.is_empty() { return Ok(0); }
        if self.remaining == 0 {
            let mut extra = [0];
            if self.inner.read(&mut extra)? != 0 {
                return Err(io::Error::other("compressed replay exceeds size limit"));
            }
            return Ok(0);
        }
        let limit = buffer.len().min(self.remaining as usize);
        let count = self.inner.read(&mut buffer[..limit])?;
        self.remaining -= count as u64;
        Ok(count)
    }
}

pub fn write_replay(reader: impl Read, file: &mut File, progress: impl FnMut(u64)) -> Result<u64, String> {
    let mut input = LimitedInput { inner: reader, remaining: MAX_REPLAY_BYTES };
    // Do not trust an archive key's suffix: older .bz2 keys may contain zstd.
    let mut magic = [0; 8];
    input.read_exact(&mut magic).map_err(|_| "replay_format_invalid")?;
    let mut input = BufReader::new(io::Cursor::new(magic).chain(input));
    if magic.starts_with(b"BZh") {
        write_demo(&mut bzip2::read::MultiBzDecoder::new(input), file, progress)
    } else if magic.starts_with(&[0x28, 0xb5, 0x2f, 0xfd]) {
        let mut decoder = zstd::stream::read::Decoder::with_buffer(input).map_err(|_| "replay_decode_failed")?;
        // Bound the decoder's window allocation independently of output size.
        decoder.window_log_max(27).map_err(|_| "replay_decode_failed")?;
        write_demo(&mut decoder, file, progress)
    } else if magic.starts_with(b"PBDEMS2\0") || magic.starts_with(b"HL2DEMO\0") {
        write_demo(&mut input, file, progress)
    } else {
        Err("replay_format_invalid".into())
    }
}

fn write_demo(reader: &mut impl Read, file: &mut File, mut progress: impl FnMut(u64)) -> Result<u64, String> {
    let mut header = [0; 8];
    reader.read_exact(&mut header).map_err(|_| "replay_decode_failed")?;
    if &header != b"PBDEMS2\0" && &header != b"HL2DEMO\0" { return Err("replay_format_invalid".into()); }
    file.write_all(&header).map_err(|_| "replay_write_failed")?;
    let mut written = 8u64;
    let mut buffer = [0; 65536];
    let mut reported = 0;
    loop {
        let count = reader.read(&mut buffer).map_err(|_| "replay_decode_failed")?;
        if count == 0 { break; }
        written += count as u64;
        if written > MAX_REPLAY_BYTES { return Err("replay_size_limit".into()); }
        file.write_all(&buffer[..count]).map_err(|_| "replay_write_failed")?;
        if written - reported >= 1024 * 1024 { progress(written); reported = written; }
    }
    if written <= 8 { return Err("replay_format_invalid".into()); }
    file.sync_all().map_err(|_| "replay_write_failed")?;
    progress(written);
    Ok(written)
}

#[cfg(test)]
mod tests {
    use super::*;
    const DEMO: &[u8] = b"PBDEMS2\0replay-body-for-a-real-codec-round-trip";
    fn decode(bytes: &[u8]) -> Result<Vec<u8>, String> {
        let mut temporary = tempfile::NamedTempFile::new().unwrap();
        let mut last = 0;
        let written = write_replay(bytes, temporary.as_file_mut(), |n| last = n)?;
        assert_eq!(last, written);
        Ok(std::fs::read(temporary.path()).unwrap())
    }
    #[test]
    fn supports_zstd_bzip_and_raw_demo_from_content_not_filename() {
        let zstd = zstd::stream::encode_all(DEMO, 1).unwrap();
        let mut bz = bzip2::write::BzEncoder::new(Vec::new(), bzip2::Compression::default());
        bz.write_all(DEMO).unwrap();
        for bytes in [zstd, bz.finish().unwrap(), DEMO.to_vec()] { assert_eq!(decode(&bytes).unwrap(), DEMO); }
    }
    #[test]
    fn rejects_compressed_html_and_truncated_streams() {
        let zstd = zstd::stream::encode_all(DEMO, 1).unwrap();
        assert!(decode(&zstd[..zstd.len()-3]).is_err());
        let mut bz = bzip2::write::BzEncoder::new(Vec::new(), bzip2::Compression::default());
        bz.write_all(DEMO).unwrap();
        let bz = bz.finish().unwrap();
        assert!(decode(&bz[..bz.len()-3]).is_err());
        assert!(decode(&zstd::stream::encode_all(&b"<html>expired"[..], 1).unwrap()).is_err());
        assert!(decode(b"<html>expired").is_err());
        assert!(decode(b"PBDEMS2\0").is_err());
    }
    #[test]
    fn compressed_input_limit_checks_an_extra_byte() {
        let mut input = LimitedInput { inner: &b"12345"[..], remaining: 4 };
        let mut bytes = Vec::new();
        assert!(input.read_to_end(&mut bytes).is_err());
        assert_eq!(bytes, b"1234");
    }
}
