import { NavigateFunction } from "react-router-dom";

let navigator: NavigateFunction;

export const setNavigator = (nav: NavigateFunction) => {
  navigator = nav;
};

export const navigate = (to: string, options?: { replace?: boolean }) => {
  navigator?.(to, { replace: options?.replace ?? false });
};