import React from "react";
import { Html, Body, Container, Heading, Text, Button } from "@react-email/components";

export function MagicLinkEmail({ url }: { url: string }) {
  return (
    <Html>
      <Body style={{ fontFamily: "system-ui", padding: 24 }}>
        <Container>
          <Heading>Sign in to Faye</Heading>
          <Text>Click below to sign in. Link expires in 10 minutes.</Text>
          <Button href={url} style={{ background: "#111", color: "#fff", padding: "10px 16px", borderRadius: 6 }}>
            Sign in
          </Button>
          <Text style={{ color: "#666", marginTop: 16 }}>Or copy: {url}</Text>
        </Container>
      </Body>
    </Html>
  );
}
