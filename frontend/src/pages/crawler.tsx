import * as React from "react";
import CrawlerUILayout from "../components/crawler";
import { graphql } from "gatsby";

// markup
const IndexPage = ({ data }: any) => {
  return (
    <CrawlerUILayout>
      <main style={{ height: "100%" }} className=" h-full "/>
    </CrawlerUILayout>
  );
};

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
