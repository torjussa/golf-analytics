import React from "react";
import { Par3Stats } from "./Par3Stats";

export const Par3Placeholder: React.FC<any> = (props) => {
  return (
    <Par3Stats
      uploaded={props.uploaded}
      shotsData={props.shotsData}
      scorecardsData={props.scorecardsData}
      clubsData={props.clubsData}
      clubTypesData={props.clubTypesData}
      dateRange={props.dateRange}
    />
  );
};
