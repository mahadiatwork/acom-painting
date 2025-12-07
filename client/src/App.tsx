import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Login from "@/pages/Login";
import Dashboard from "@/pages/Dashboard";
import NewEntry from "@/pages/NewEntry";
import History from "@/pages/History";
import Projects from "@/pages/Projects";
import Profile from "@/pages/Profile";
import Notices from "@/pages/Notices";
import ForgotPassword from "@/pages/ForgotPassword";

function Router() {
  return (
    <Switch>
      <Route path="/login" component={Login} />
      <Route path="/forgot-password" component={ForgotPassword} />
      <Route path="/" component={Dashboard} />
      <Route path="/entry/new" component={NewEntry} />
      <Route path="/history" component={History} />
      <Route path="/projects" component={Projects} />
      <Route path="/profile" component={Profile} />
      <Route path="/notices" component={Notices} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
