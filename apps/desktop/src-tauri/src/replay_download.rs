//! API authorization and storage transfer are separate requests.
use std::{io::Read, time::Duration};
use reqwest::{blocking::{Client, Request}, Url};
use serde::Deserialize;
use sha2::{Digest, Sha256};
const MAX_ARCHIVE_BYTES: u64 = 200 * 1024 * 1024;
const STORAGE_HOSTS: &[&str] = &["c677095.parspack.net"];
#[derive(Clone, Deserialize)]
pub struct DownloadDescriptor { pub url: String, pub bytes: u64, pub sha256: String }
#[derive(Deserialize)]
struct TicketResponse { ok: bool, download: DownloadDescriptor }
pub struct VerifiedInput<R> { inner: R, bytes: u64, expected_bytes: u64, hash: Sha256 }
impl<R: Read> VerifiedInput<R> {
    pub fn new(inner: R, expected_bytes: u64) -> Self { Self { inner, bytes: 0, expected_bytes, hash: Sha256::new() } }
    pub fn verify(&self, expected_hash: &str) -> Result<(), String> {
        if self.bytes != self.expected_bytes || format!("{:x}", self.hash.clone().finalize()) != expected_hash { return Err("replay_integrity_failed".into()); }
        Ok(())
    }
}
impl<R: Read> Read for VerifiedInput<R> {
    fn read(&mut self, buffer: &mut [u8]) -> std::io::Result<usize> {
        let count = self.inner.read(buffer)?; self.bytes += count as u64;
        if self.bytes > self.expected_bytes { return Err(std::io::Error::other("replay_size_limit")); }
        self.hash.update(&buffer[..count]); Ok(count)
    }
}
pub fn validate_descriptor(v: &DownloadDescriptor, id: &str) -> Result<Url, String> {
    if v.url.len() > 8192 || v.bytes <= 8 || v.bytes > MAX_ARCHIVE_BYTES || v.sha256.len() != 64 || !v.sha256.bytes().all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b)) { return Err("replay_archive_unavailable".into()); }
    let url = Url::parse(&v.url).map_err(|_| "replay_archive_unavailable")?;
    if url.scheme() != "https" || !url.host_str().is_some_and(|h| STORAGE_HOSTS.contains(&h)) || url.port().is_some() || !url.username().is_empty() || url.password().is_some() || url.fragment().is_some() { return Err("replay_archive_unavailable".into()); }
    let filename = url.path_segments().and_then(|mut p| p.next_back()).unwrap_or("");
    let prefix = format!("{id}_");
    let valid_name = filename.strip_suffix(".dem.bz2").or_else(|| filename.strip_suffix(".dem")).is_some_and(|stem| stem == id || stem.strip_prefix(prefix.as_str()).is_some_and(|s| !s.is_empty() && !s.starts_with('0') && s.bytes().all(|b| b.is_ascii_digit())));
    if !url.path().contains("/replays/") || !valid_name || !url.query_pairs().any(|(k,s)| k == "X-Amz-Signature" && s.len() == 64 && s.bytes().all(|b| b.is_ascii_hexdigit())) { return Err("replay_archive_unavailable".into()); }
    Ok(url)
}
pub fn fetch_ticket(client: &Client, origin: &Url, id: &str, token: &str) -> Result<DownloadDescriptor, String> {
    let url = origin.join(&format!("/api/replays/{id}/download")).map_err(|_| "replay_archive_unavailable")?;
    let response = client.get(url).bearer_auth(token).timeout(Duration::from_secs(20)).send().map_err(|_| "replay_transfer_failed")?;
    match response.status().as_u16() { 401 => return Err("unauthorized".into()), 409 => return Err("replay_archive_pending".into()), 200 => {}, _ => return Err("replay_archive_unavailable".into()) }
    let mut body = Vec::new(); response.take(16_385).read_to_end(&mut body).map_err(|_| "replay_transfer_failed")?;
    if body.len() > 16_384 { return Err("replay_archive_unavailable".into()); }
    let ticket: TicketResponse = serde_json::from_slice(&body).map_err(|_| "replay_archive_unavailable")?;
    if !ticket.ok { return Err("replay_archive_unavailable".into()); }
    validate_descriptor(&ticket.download, id)?; Ok(ticket.download)
}
pub fn storage_request(client: &Client, ticket: &DownloadDescriptor, id: &str) -> Result<Request, String> {
    client.get(validate_descriptor(ticket, id)?).build().map_err(|_| "replay_transfer_failed".into())
}
#[cfg(test)]
mod tests {
    use super::*;
    fn descriptor() -> DownloadDescriptor { DownloadDescriptor { url: format!("https://c677095.parspack.net/c677095/replays/2026/11/05/9070494281.dem.bz2?X-Amz-Signature={}", "a".repeat(64)), bytes: 150 * 1024 * 1024, sha256: "b".repeat(64) } }
    #[test] fn validates_current_and_legacy_names() {
        let mut v=descriptor(); assert!(validate_descriptor(&v,"9070494281").is_ok()); v.url=v.url.replace("9070494281.dem","9070494281_123.dem"); assert!(validate_descriptor(&v,"9070494281").is_ok());
    }
    #[test] fn rejects_untrusted_destinations_and_wrong_match() {
        for (a,b) in [("https://","http://"),("c677095.parspack.net","attacker.test"),("c677095.parspack.net","127.0.0.1"),("c677095.parspack.net","user:pass@c677095.parspack.net"),("c677095.parspack.net","c677095.parspack.net:8443"),("/replays/","/private/"),("9070494281.dem","9070494282.dem")] { let mut v=descriptor();v.url=v.url.replace(a,b); assert!(validate_descriptor(&v,"9070494281").is_err()); }
        let mut v=descriptor();v.url.push_str("#fragment");assert!(validate_descriptor(&v,"9070494281").is_err());
    }
    #[test] fn bounds_ticket_size_hash_and_signature() {
        let mut v=descriptor();v.url=v.url.split('?').next().unwrap().into();assert!(validate_descriptor(&v,"9070494281").is_err());
        let mut v=descriptor();v.sha256="x".repeat(64);assert!(validate_descriptor(&v,"9070494281").is_err());
        for bytes in [0,8,MAX_ARCHIVE_BYTES+1] {let mut v=descriptor();v.bytes=bytes;assert!(validate_descriptor(&v,"9070494281").is_err());}
    }
    #[test] fn storage_has_no_application_token_or_cookie() {
        let client=Client::builder().redirect(reqwest::redirect::Policy::none()).build().unwrap();let req=storage_request(&client,&descriptor(),"9070494281").unwrap();assert!(req.headers().get(reqwest::header::AUTHORIZATION).is_none());assert!(req.headers().get(reqwest::header::COOKIE).is_none());
    }
    #[test] fn verifies_all_original_network_bytes() {
        let body=b"PBDEMS2\0network-bytes";let expected=format!("{:x}",Sha256::digest(body));
        let mut r=VerifiedInput::new(&body[..],body.len() as u64);std::io::copy(&mut r,&mut std::io::sink()).unwrap();assert!(r.verify(&expected).is_ok());assert!(r.verify(&"0".repeat(64)).is_err());
        let mut r=VerifiedInput::new(&body[..body.len()-1],body.len() as u64);std::io::copy(&mut r,&mut std::io::sink()).unwrap();assert!(r.verify(&expected).is_err());
        let mut r=VerifiedInput::new(&body[..],body.len() as u64-1);assert!(std::io::copy(&mut r,&mut std::io::sink()).is_err());
    }
    fn ticket_server(status: u16, body: String) -> (Url, std::thread::JoinHandle<()>) {
        use std::{io::{Read, Write}, net::TcpListener};
        let listener=TcpListener::bind("127.0.0.1:0").unwrap();
        let origin=Url::parse(&format!("http://{}/",listener.local_addr().unwrap())).unwrap();
        let handle=std::thread::spawn(move||{
            let (mut stream,_)=listener.accept().unwrap();
            stream.set_read_timeout(Some(Duration::from_secs(5))).unwrap();
            let mut received=Vec::new();let mut buffer=[0;512];
            while !received.windows(4).any(|x|x==b"\r\n\r\n") {
                let n=stream.read(&mut buffer).unwrap();if n==0 {break;} received.extend_from_slice(&buffer[..n]);
            }
            let headers=String::from_utf8_lossy(&received).to_lowercase();
            assert!(headers.starts_with("get /api/replays/9070494281/download "));
            assert!(headers.contains("authorization: bearer app-test-token"));
            let response=format!("HTTP/1.1 {status} Test\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",body.len());
            let _=stream.write_all(response.as_bytes());
        });
        (origin,handle)
    }
    #[test] fn fetches_a_small_authorized_ticket() {
        let d=descriptor();let body=serde_json::json!({"ok":true,"download":{"url":d.url,"bytes":d.bytes,"sha256":d.sha256,"expiresAt":"2026-11-06T12:00:00Z"}}).to_string();
        let (origin,handle)=ticket_server(200,body);
        let client=Client::builder().no_proxy().redirect(reqwest::redirect::Policy::none()).build().unwrap();
        let result=fetch_ticket(&client,&origin,"9070494281","app-test-token").unwrap();
        assert_eq!(result.bytes,d.bytes);handle.join().unwrap();
    }
    #[test] fn pending_and_unauthorized_are_distinct_from_transport_failure() {
        let client=Client::builder().no_proxy().build().unwrap();
        for (status,code) in [(409,"replay_archive_pending"),(401,"unauthorized")] {
            let (origin,handle)=ticket_server(status,"{}".into());
            let error=fetch_ticket(&client,&origin,"9070494281","app-test-token").err().unwrap();
            assert_eq!(error,code);handle.join().unwrap();
        }
    }
    #[test] fn rejects_oversized_ticket_bodies_without_echoing_their_contents() {
        let client=Client::builder().no_proxy().build().unwrap();
        let (origin,handle)=ticket_server(200,"private-signed-url".repeat(2000));
        let error=fetch_ticket(&client,&origin,"9070494281","app-test-token").err().unwrap();
        assert_eq!(error,"replay_archive_unavailable");handle.join().unwrap();
    }

}
