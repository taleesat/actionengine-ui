import * as React from "react";
import MagenticUILayout from "../components/layout";
import { graphql } from "gatsby";
import type { HeadFC } from "gatsby";

// markup
const IndexPage = ({ data }: any) => {
  return (
    <MagenticUILayout meta={data.site.siteMetadata} title="Home" link={"/"}>
      <main style={{ height: "100%" }} className=" h-full ">
      </main>
    </MagenticUILayout>
  );
};

export const Head: HeadFC = ({ data }: any) => (
  <>
    <html lang="en" />
    <title>{data.site.siteMetadata.title}</title>
    <meta name="description" content={data.site.siteMetadata.description} />
  </>
);

export const query = graphql`
  query HomePageQuery {
    site {
      siteMetadata {
        description
        title
      }
    }
  }
`;

export default IndexPage;
