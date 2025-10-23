import React from "react";
import { ApproachStats } from "./ApproachStats";

export const ApproachPlaceholder: React.FC<any> = (props) => {
  return (
    <ApproachStats
      uploaded={props.uploaded}
      shotsData={props.shotsData}
      scorecardsData={props.scorecardsData}
      clubsData={props.clubsData}
      clubTypesData={props.clubTypesData}
      dateRange={props.dateRange}
    />
  );
};
