import { Component } from '@angular/core';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss']
})
export class AppComponent {
  title = 'student-hub';

  profileMenu: boolean = false;

  authenticated: boolean = false

  toggleMenu(){
    this.profileMenu = !this.profileMenu;
  }
  
  getCurrentDate(){
    return new Date();
  }
}
